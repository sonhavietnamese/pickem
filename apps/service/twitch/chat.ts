import { api } from 'encore.dev/api'
import tmi from 'tmi.js'

const channels = ['dima_wallhacks']

let client: tmi.Client | null = null
let isConnected = false

function createClient() {
  return new tmi.Client({
    channels,
  })
}

async function startListening() {
  if (isConnected) {
    console.log('Already connected to Twitch chat')
    return { success: true, message: 'Already connected' }
  }

  console.log('Connecting to Twitch chat...')
  try {
    client = createClient()

    client.on('message', (channel, tags, message, self) => {
      // "[username][displayname]: [chat message]"
      console.log(`[${tags.username}][${tags['display-name']}]: ${message}`)
    })

    // Handle disconnection
    client.on('disconnected', (reason) => {
      console.log(`Disconnected from Twitch: ${reason}`)
      isConnected = false
    })

    // Handle reconnection
    client.on('reconnect', () => {
      console.log('Reconnected to Twitch chat')
      isConnected = true
    })

    await client.connect()
    isConnected = true
    console.log('Connected to channels: ', channels.join(', '))

    return { success: true, message: `Connected to channels: ${channels.join(', ')}` }
  } catch (error) {
    console.error('Failed to connect to Twitch chat:', error)
    isConnected = false
    return { success: false, message: `Failed to connect: ${error}` }
  }
}

async function stopListening() {
  if (!client || !isConnected) {
    return { success: false, message: 'Not connected' }
  }

  try {
    await client.disconnect()
    isConnected = false
    client = null
    console.log('Disconnected from Twitch chat')
    return { success: true, message: 'Disconnected successfully' }
  } catch (error) {
    console.error('Error disconnecting:', error)
    return { success: false, message: `Error disconnecting: ${error}` }
  }
}

// API endpoint to start listening
export const start = api(
  { expose: true, method: 'GET', path: '/twitch/start' },
  async (): Promise<{ success: boolean; message: string }> => {
    return startListening()
  },
)

// API endpoint to stop listening
export const stop = api(
  { expose: true, method: 'POST', path: '/twitch/stop' },
  async (): Promise<{ success: boolean; message: string }> => {
    return stopListening()
  },
)

// Start listening automatically when the service starts
startListening()
