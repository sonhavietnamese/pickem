export interface CreateMarketDto {
  username: string
  question: string
  initialLiquidity: number
  endTime: number // in seconds
}

export interface MarketDto {
  market: string
}

export interface MarketResponse {
  success: boolean
  message?: string
  result?: MarketDto[] | MarketDto
}

export interface CreateMarketResponse {
  success: boolean
  message?: string
  result?: MarketDto[] | MarketDto
}

export interface MarketDetailDto {
  question: string
  resolved: boolean
  resolvable: boolean
  endTime: string
  winningTokenId?: string | number | Record<string, unknown> | null
  creator: string
  yesTokenMint: string
  noTokenMint: string
}

export interface MarketDetailResponse {
  success: boolean
  message?: string
  result?: MarketDetailDto
}
