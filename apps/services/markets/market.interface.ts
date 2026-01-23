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
