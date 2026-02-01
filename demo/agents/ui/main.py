#!/usr/bin/env python3
"""
Terminal dashboard to display game context information filtered by username.
Runs continuously and updates on file changes.
"""

import argparse
import json
import sys
import time
import signal
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any, List, Set, Tuple
import math

try:
    from rich.console import Console, Group
    from rich.table import Table
    from rich.panel import Panel
    from rich.layout import Layout
    from rich.text import Text
    from rich.live import Live
    from rich import box
    HAS_RICH = True
except ImportError:
    HAS_RICH = False
    print("Warning: 'rich' library not found. Install with: pip install rich")
    print("Falling back to basic terminal output.\n")

try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
    HAS_WATCHDOG = True
except ImportError:
    HAS_WATCHDOG = False
    print("Warning: 'watchdog' library not found. Install with: pip install watchdog")
    print("Falling back to polling mode.\n")


def load_game_context(json_path: Path) -> Dict[str, Any]:
    """Load game context from JSON file."""
    if not json_path.exists():
        raise FileNotFoundError(f"Game context file not found: {json_path}")
    
    with open(json_path, 'r') as f:
        return json.load(f)


def find_player_data(frames: List[Dict], username: str) -> List[Dict]:
    """Find all frames where the player appears."""
    player_frames = []
    
    for frame in frames:
        analysis = frame.get('analysis', {})
        teams = analysis.get('teams', [])
        
        # Check if player is in any team
        for team in teams:
            players = team.get('players', [])
            for player in players:
                if player.get('name', '').lower() == username.lower():
                    player_frames.append({
                        'frame': frame,
                        'team': team,
                        'player_data': player
                    })
                    break
        
        # Also check if it's the tracked player (from player field)
        player_info = analysis.get('player', {})
        if player_info:
            # Check if this frame's player matches (we'll use streamer name or check teams)
            pass
    
    return player_frames


def get_latest_frame_data(frames: List[Dict], username: str) -> Optional[Dict]:
    """Get the most recent frame data where the username appears."""
    if not frames:
        return None
    
    # Search from latest frame backwards to find the most recent frame with this player
    for frame in reversed(frames):
        analysis = frame.get('analysis', {})
        teams = analysis.get('teams', [])
        
        # Find player in teams
        for team in teams:
            players = team.get('players', [])
            for player in players:
                if player.get('name', '').lower() == username.lower():
                    return {
                        'frame': frame,
                        'team': team,
                        'player_data': player,
                        'analysis': analysis
                    }
    
    return None


def format_money(money: int) -> str:
    """Format money value."""
    return f"${money:,}"


def string_to_vector(s: str, n: int = 2) -> Dict[str, int]:
    """Convert string to character n-gram vector."""
    s = s.lower()
    vector = {}
    for i in range(len(s) - n + 1):
        ngram = s[i:i+n]
        vector[ngram] = vector.get(ngram, 0) + 1
    return vector


def cosine_similarity(vec1: Dict[str, int], vec2: Dict[str, int]) -> float:
    """Calculate cosine similarity between two vectors."""
    # Get all unique keys from both vectors
    all_keys = set(vec1.keys()) | set(vec2.keys())
    
    if not all_keys:
        return 1.0  # Both empty strings
    
    # Calculate dot product
    dot_product = sum(vec1.get(key, 0) * vec2.get(key, 0) for key in all_keys)
    
    # Calculate magnitudes
    magnitude1 = math.sqrt(sum(vec1.get(key, 0) ** 2 for key in all_keys))
    magnitude2 = math.sqrt(sum(vec2.get(key, 0) ** 2 for key in all_keys))
    
    if magnitude1 == 0 or magnitude2 == 0:
        return 0.0
    
    return dot_product / (magnitude1 * magnitude2)


def string_similarity(s1: str, s2: str, ngram_size: int = 2) -> float:
    """
    Calculate cosine similarity between two strings using character n-grams.
    Returns a value between 0.0 and 1.0.
    
    Args:
        s1: First string
        s2: Second string
        ngram_size: Size of character n-grams (default: 2 for bigrams)
    
    Returns:
        Cosine similarity score (0.0 to 1.0)
    """
    vec1 = string_to_vector(s1, ngram_size)
    vec2 = string_to_vector(s2, ngram_size)
    return cosine_similarity(vec1, vec2)


def merge_similar_player_names(players: List[Tuple[str, str, int, int]], 
                                similarity_threshold: float = 0.65) -> List[Tuple[str, str, int, int]]:
    """
    Merge players with similar names that are likely the same person.
    Keeps the name that appears most frequently, and the latest health/money data.
    
    Args:
        players: List of (team, name, health, money) tuples (preserves insertion order)
        similarity_threshold: Minimum similarity ratio to consider names as duplicates (0.0-1.0)
    
    Returns:
        List of merged players with duplicate names removed
    """
    if not players:
        return players
    
    # Group players by team first, preserving order
    players_by_team: Dict[str, List[Tuple[str, int, int]]] = {}
    for team, name, health, money in players:
        if team not in players_by_team:
            players_by_team[team] = []
        players_by_team[team].append((name, health, money))
    
    merged_players = []
    
    # Process each team separately
    for team, team_players in players_by_team.items():
        # Count occurrences of each name
        name_counts: Dict[str, int] = {}
        for name, _, _ in team_players:
            name_counts[name] = name_counts.get(name, 0) + 1
        
        # Track latest data for each name (process in order, last occurrence wins)
        name_latest_data: Dict[str, Tuple[int, int]] = {}  # name -> (health, money)
        for name, health, money in team_players:
            name_latest_data[name] = (health, money)
        
        # Find groups of similar names
        processed_names: Set[str] = set()
        name_groups: List[List[str]] = []
        
        for name1 in name_counts.keys():
            if name1 in processed_names:
                continue
            
            # Find all names similar to name1
            similar_group = [name1]
            processed_names.add(name1)
            
            for name2 in name_counts.keys():
                if name2 in processed_names:
                    continue
                
                if string_similarity(name1, name2) >= similarity_threshold:
                    similar_group.append(name2)
                    processed_names.add(name2)
            
            name_groups.append(similar_group)
        
        # For each group, keep the most common name and latest data
        for group in name_groups:
            if len(group) == 1:
                # No duplicates, keep as is
                name = group[0]
                health, money = name_latest_data[name]
                merged_players.append((team, name, health, money))
            else:
                # Multiple similar names - keep the most common one
                group_with_counts = [(name, name_counts[name]) for name in group]
                group_with_counts.sort(key=lambda x: (-x[1], x[0]))  # Sort by count desc, then name
                canonical_name = group_with_counts[0][0]
                
                # Get latest health/money from the canonical name (or any if not available)
                if canonical_name in name_latest_data:
                    latest_health, latest_money = name_latest_data[canonical_name]
                else:
                    # Fallback to any name in the group
                    latest_health, latest_money = 0, 0
                    for name in group:
                        if name in name_latest_data:
                            latest_health, latest_money = name_latest_data[name]
                            break
                
                merged_players.append((team, canonical_name, latest_health, latest_money))
    
    # Sort by team, then by name
    merged_players.sort(key=lambda x: (x[0], x[1]))
    return merged_players


def get_all_kills_from_frames(frames: List[Dict]) -> List[Dict]:
    """Extract all kills from all frames."""
    all_kills = []
    for frame in frames:
        analysis = frame.get('analysis', {})
        kills = analysis.get('kills', [])
        all_kills.extend(kills)
    return all_kills


def get_all_players_from_frames(frames: List[Dict]) -> List[Tuple[str, str, int, int]]:
    """Extract all unique players from all frames. Returns list of (team, name, health, money)."""
    players_seen = {}  # key: (team, name) -> (health, money)
    
    for frame in frames:
        analysis = frame.get('analysis', {})
        teams = analysis.get('teams', [])
        
        for team in teams:
            team_name = team.get('name', 'Unknown')
            for player in team.get('players', []):
                player_name = player.get('name', 'Unknown')
                key = (team_name, player_name)
                # Update with latest data for this player
                players_seen[key] = (
                    player.get('health', 0),
                    player.get('money', 0)
                )
    
    # Convert to list of tuples
    result = []
    for (team_name, player_name), (health, money) in players_seen.items():
        result.append((team_name, player_name, health, money))
    
    # Merge similar player names (e.g., "Saivert" vs "Salvert")
    # Using cosine similarity with character bigrams - threshold of 0.65 works well
    result = merge_similar_player_names(result, similarity_threshold=0.65)
    
    # Sort by team, then by name
    result.sort(key=lambda x: (x[0], x[1]))
    return result


def create_dashboard_renderable(data: Dict[str, Any], username: str, player_data: Optional[Dict],
                                all_kills: List[Dict], all_players: List[Tuple[str, str, int, int]]):
    """Create dashboard renderable for rich Live."""
    session = data.get('session', {})
    frames = session.get('frames', [])
    
    # Header
    header = Panel(
      
        f"Streamer: [yellow]{session.get('streamer', 'Unknown')}[/yellow]\n"
        f"Total Frames: [green]{session.get('total_frames', 0)}[/green]\n"
        f"Last Update: [blue]{session.get('last_update', 'Unknown')}[/blue]",
        title="Session Info",
        border_style="cyan"
    )
    
    if not player_data:
        return Group(header, Text(f"\n[red]Player '{username}' not found in any frame.[/red]"))
    
    frame = player_data['frame']
    analysis = player_data['analysis']
    team = player_data['team']
    player = player_data['player_data']
    
    # Player Info Panel
    player_info = Table.grid(padding=0)
    player_info.add_row("[bold]Name:[/bold]", f"[yellow]{player.get('name', 'Unknown')}[/yellow]")
    player_info.add_row("[bold]Health:[/bold]", f"[{'green' if player.get('health', 0) > 50 else 'red'}]{player.get('health', 0)}[/]")
    player_info.add_row("[bold]Money:[/bold]", f"[green]{format_money(player.get('money', 0))}[/green]")
    player_info.add_row("[bold]Team:[/bold]", f"[cyan]{team.get('name', 'Unknown')}[/cyan]")
    player_info.add_row("[bold]Team Score:[/bold]", f"[yellow]{team.get('score', 0)}[/yellow]")
    
    player_panel = Panel(player_info, title=f"Player: {username}", border_style="yellow")
    
    # Game State Panel
    state = analysis.get('state', {})
    game_state = Table.grid(padding=0)
    game_state.add_row("[bold]Map:[/bold]", f"[magenta]{analysis.get('map', 'Unknown')}[/magenta]")
    game_state.add_row("[bold]Timer:[/bold]", f"[cyan]{state.get('timer', 0)}[/cyan]")
    game_state.add_row("[bold]Score:[/bold]", f"Team1: [yellow]{state.get('score', {}).get('team1', 0)}[/yellow] | Team2: [yellow]{state.get('score', {}).get('team2', 0)}[/yellow]")
    game_state.add_row("[bold]Players:[/bold]", f"Team1: [green]{state.get('players', {}).get('team1', 0)}[/green] | Team2: [green]{state.get('players', {}).get('team2', 0)}[/green]")
    
    state_panel = Panel(game_state, title="Game State", border_style="green")
    
    # Weapons Table
    weapons_panel = None
    weapons = analysis.get('weapon', [])
    if weapons:
        weapons_table = Table(title="Weapons", show_header=True, header_style="bold magenta", box=box.ROUNDED)
        weapons_table.add_column("Name", style="cyan")
        weapons_table.add_column("Type", style="blue")
        weapons_table.add_column("Skin", style="yellow")
        weapons_table.add_column("Ammo", justify="right", style="green")
        weapons_table.add_column("Active", justify="center", style="bold")
        
        for weapon in weapons:
            active = "✓" if weapon.get('is_active', False) else "✗"
            active_style = "green" if weapon.get('is_active', False) else "dim"
            weapons_table.add_row(
                weapon.get('name', 'Unknown'),
                weapon.get('type', 'Unknown'),
                weapon.get('skin', 'Unknown'),
                str(weapon.get('ammo', 0)),
                f"[{active_style}]{active}[/]"
            )
        weapons_panel = weapons_table
    
    # All Players Table (accumulated)
    teams_table = Table(title=f"All Players (Total: {len(all_players)})", show_header=True, header_style="bold cyan", box=box.ROUNDED)
    teams_table.add_column("Team", style="magenta")
    teams_table.add_column("Player", style="yellow")
    teams_table.add_column("Health", justify="right", style="green")
    teams_table.add_column("Money", justify="right", style="green")
    
    for team_name, player_name, health, money in all_players:
        # Highlight the searched player
        display_name = player_name
        if player_name.lower() == username.lower():
            display_name = f"[bold yellow]{player_name}[/bold yellow]"
        teams_table.add_row(
            team_name,
            display_name,
            str(health),
            format_money(money)
        )
    
    # Kills Table (accumulated)
    kills_panel = None
    if all_kills:
        kills_table = Table(title=f"All Kills (Total: {len(all_kills)})", show_header=True, header_style="bold red", box=box.ROUNDED)
        kills_table.add_column("Killer", style="yellow")
        kills_table.add_column("Victim", style="red")
        kills_table.add_column("Weapon", style="cyan")
        
        for kill in all_kills:
            kills_table.add_row(
                kill.get('killer', 'Unknown'),
                kill.get('victim', 'Unknown'),
                kill.get('weapon', 'Unknown')
            )
        kills_panel = kills_table
    
    # Frame Info
    frame_info = Panel(
        f"Frame: [bold]{frame.get('frame_number', 'Unknown')}[/bold]\n"
        f"Timestamp: [blue]{frame.get('timestamp', 'Unknown')}[/blue]\n"
        f"Processing Time: [yellow]{frame.get('processing_time_seconds', 0):.2f}s[/yellow]",
        title="Frame Info",
        border_style="dim"
    )
    
    # Build renderable group
    renderables = [
        # header,
        player_panel,
        state_panel,
    ]
    
    if weapons_panel:
        renderables.extend([weapons_panel])
    
    # renderables.append(teams_table)
    
    if kills_panel:
        renderables.extend([kills_panel])
    
    # renderables.append(frame_info)
    
    return Group(*renderables)


def render_dashboard_basic(data: Dict[str, Any], username: str, player_data: Optional[Dict],
                           all_kills: List[Dict], all_players: List[Tuple[str, str, int, int]]):
    """Render dashboard using basic terminal output."""
    session = data.get('session', {})
    frames = session.get('frames', [])
    
    print("\033[2J\033[H")  # Clear screen
    print("=" * 80)
    print("GAME DASHBOARD | Press Ctrl+C to exit")
    print("=" * 80)
    print(f"Streamer: {session.get('streamer', 'Unknown')}")
    print(f"Total Frames: {session.get('total_frames', 0)}")
    print(f"Last Update: {session.get('last_update', 'Unknown')}")
    print("=" * 80)
    print()
    
    if not player_data:
        print(f"Player '{username}' not found in any frame.")
        return
    
    frame = player_data['frame']
    analysis = player_data['analysis']
    team = player_data['team']
    player = player_data['player_data']
    
    print(f"PLAYER: {username}")
    print("-" * 80)
    print(f"  Name: {player.get('name', 'Unknown')}")
    print(f"  Health: {player.get('health', 0)}")
    print(f"  Money: ${player.get('money', 0):,}")
    print(f"  Team: {team.get('name', 'Unknown')}")
    print(f"  Team Score: {team.get('score', 0)}")
    print()
    
    print("GAME STATE")
    print("-" * 80)
    state = analysis.get('state', {})
    print(f"  Map: {analysis.get('map', 'Unknown')}")
    print(f"  Timer: {state.get('timer', 0)}")
    print(f"  Score: Team1: {state.get('score', {}).get('team1', 0)} | Team2: {state.get('score', {}).get('team2', 0)}")
    print(f"  Players: Team1: {state.get('players', {}).get('team1', 0)} | Team2: {state.get('players', {}).get('team2', 0)}")
    print()
    
    weapons = analysis.get('weapon', [])
    if weapons:
        print("-" * 80)
        for weapon in weapons:
            active = "ACTIVE" if weapon.get('is_active', False) else "inactive"
            print(f"  {weapon.get('name', 'Unknown')} ({weapon.get('type', 'Unknown')}) - "
                  f"Skin: {weapon.get('skin', 'Unknown')}, Ammo: {weapon.get('ammo', 0)}, {active}")
        print()
    
    print("-" * 80)
    current_team = None
    for team_name, player_name, health, money in all_players:
        if team_name != current_team:
            print(f"  {team_name}:")
            current_team = team_name
        marker = ">>> " if player_name.lower() == username.lower() else "    "
        print(f"{marker}{player_name} - Health: {health}, Money: ${money:,}")
    print()
    
    if all_kills:
        print("-" * 80)
        for kill in all_kills:
            print(f"  {kill.get('killer', 'Unknown')} killed {kill.get('victim', 'Unknown')} with {kill.get('weapon', 'Unknown')}")
        print()
    
    print("-" * 80)
    print(f"  Frame: {frame.get('frame_number', 'Unknown')}")
    print(f"  Timestamp: {frame.get('timestamp', 'Unknown')}")
    print(f"  Processing Time: {frame.get('processing_time_seconds', 0):.2f}s")
    print("=" * 80)


if HAS_WATCHDOG:
    class GameContextHandler(FileSystemEventHandler):
        """File system event handler for game context file."""
        
        def __init__(self, json_path: Path, username: str, update_func):
            self.json_path = json_path
            self.username = username
            self.update_func = update_func
            self.last_modified = 0
        
        def on_modified(self, event):
            """Handle file modification event."""
            if event.src_path == str(self.json_path):
                # Check if file was actually modified (avoid duplicate events)
                try:
                    current_mtime = self.json_path.stat().st_mtime
                    if current_mtime != self.last_modified:
                        self.last_modified = current_mtime
                        time.sleep(0.1)  # Small delay to ensure file write is complete
                        self.update_func()
                except Exception:
                    pass
else:
    # Dummy class when watchdog is not available
    class GameContextHandler:
        """Dummy handler when watchdog is not available."""
        pass


def wait_for_game_context(json_path: Path, console: Optional[Any] = None) -> None:
    """Wait for game context file to exist, retrying every 1 second."""
    while not json_path.exists():
        if console:
            console.print(f"[yellow]Waiting for game context file: {json_path}[/yellow]")
        else:
            print(f"Waiting for game context file: {json_path}")
        time.sleep(1)


def update_dashboard_data(json_path: Path, username: str) -> Optional[Dict]:
    """Load data and return dashboard data dict."""
    try:
        data = load_game_context(json_path)
    except FileNotFoundError as e:
        return None
    except json.JSONDecodeError as e:
        return None
    
    # Get player data
    frames = data.get('session', {}).get('frames', [])
    player_data = get_latest_frame_data(frames, username)
    
    # Get accumulated data
    all_kills = get_all_kills_from_frames(frames)
    all_players = get_all_players_from_frames(frames)
    
    return {
        'data': data,
        'player_data': player_data,
        'all_kills': all_kills,
        'all_players': all_players
    }


def main():
    """Main function."""
    # Parse command line arguments
    parser = argparse.ArgumentParser(
        description="Terminal dashboard to display game context information filtered by username"
    )
    parser.add_argument(
        "username",
        help="Username to filter and display"
    )
    args = parser.parse_args()
    
    username = args.username
    
    # Load game context
    script_dir = Path(__file__).parent
    json_path = script_dir.parent / 'watcher' / username / 'game_context.json'
    
    if HAS_RICH:
        # Use Live context manager for in-place updates
        console = Console()
        
        # Wait for game context file to exist
        wait_for_game_context(json_path, console)
        
        dashboard_data = update_dashboard_data(json_path, username)
        
        if dashboard_data is None:
            console.print(f"[red]Error loading game context file.[/red]")
            sys.exit(1)
        
        # Create initial renderable
        renderable = create_dashboard_renderable(
            dashboard_data['data'],
            username,
            dashboard_data['player_data'],
            dashboard_data['all_kills'],
            dashboard_data['all_players']
        )
        
        # Set up signal handler for graceful exit
        running = [True]
        
        def signal_handler(sig, frame):
            running[0] = False
        
        signal.signal(signal.SIGINT, signal_handler)
        
        # Update function for Live context
        def update_renderable():
            nonlocal renderable
            new_data = update_dashboard_data(json_path, username)
            if new_data is not None:
                renderable = create_dashboard_renderable(
                    new_data['data'],
                    username,
                    new_data['player_data'],
                    new_data['all_kills'],
                    new_data['all_players']
                )
            # If new_data is None, keep the existing renderable
        
        # Set up file watching
        if HAS_WATCHDOG:
            event_handler = GameContextHandler(json_path, username, update_renderable)
            observer = Observer()
            observer.schedule(event_handler, path=str(json_path.parent), recursive=False)
            observer.start()
            
            try:
                with Live(renderable, console=console, refresh_per_second=4, screen=True) as live:
                    while running[0]:
                        live.update(renderable)
                        time.sleep(0.25)  # Update 4 times per second
            except KeyboardInterrupt:
                pass
            finally:
                observer.stop()
                observer.join()
        else:
            # Polling mode
            last_mtime = json_path.stat().st_mtime if json_path.exists() else 0
            
            try:
                with Live(renderable, console=console, refresh_per_second=4, screen=True) as live:
                    while running[0]:
                        if json_path.exists():
                            current_mtime = json_path.stat().st_mtime
                            if current_mtime != last_mtime:
                                last_mtime = current_mtime
                                time.sleep(0.1)  # Small delay to ensure file write is complete
                                update_renderable()
                        live.update(renderable)
                        time.sleep(0.25)  # Update 4 times per second
            except KeyboardInterrupt:
                pass
        
        console.print("\n[yellow]Shutting down...[/yellow]")
    else:
        # Basic mode - fallback to original behavior
        # Wait for game context file to exist
        wait_for_game_context(json_path)
        
        def update_basic_dashboard():
            dashboard_data = update_dashboard_data(json_path, username)
            if dashboard_data:
                render_dashboard_basic(
                    dashboard_data['data'],
                    username,
                    dashboard_data['player_data'],
                    dashboard_data['all_kills'],
                    dashboard_data['all_players']
                )
        
        # Initial render
        update_basic_dashboard()
        
        # Set up signal handler for graceful exit
        running = [True]
        
        def signal_handler(sig, frame):
            running[0] = False
            print("\nShutting down...")
        
        signal.signal(signal.SIGINT, signal_handler)
        
        # Set up file watching
        if HAS_WATCHDOG:
            event_handler = GameContextHandler(json_path, username, update_basic_dashboard)
            observer = Observer()
            observer.schedule(event_handler, path=str(json_path.parent), recursive=False)
            observer.start()
            
            try:
                while running[0]:
                    time.sleep(0.1)
            except KeyboardInterrupt:
                pass
            finally:
                observer.stop()
                observer.join()
        else:
            # Polling mode
            last_mtime = json_path.stat().st_mtime if json_path.exists() else 0
            
            try:
                while running[0]:
                    if json_path.exists():
                        current_mtime = json_path.stat().st_mtime
                        if current_mtime != last_mtime:
                            last_mtime = current_mtime
                            time.sleep(0.1)  # Small delay to ensure file write is complete
                            update_basic_dashboard()
                    time.sleep(0.5)  # Poll every 500ms
            except KeyboardInterrupt:
                pass


if __name__ == '__main__':
    main()
