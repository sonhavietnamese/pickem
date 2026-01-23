export interface StreamerDto {
  /** ID of the user */
  id: number
  /** Name of the user */
  username: string
}

export interface CreateStreamerDto {
  /** Name of the user */
  username: string
  /** Wallet of the user */
  wallet: string
}

export interface UpdateStreamerDto {
  /** Name of the user */
  username?: string
  /** Wallet of the user */
  wallet?: string
}

export interface Response {
  /** Indicates if the request was successful */
  success: boolean
  /** Error message if the request was not successful */
  message?: string
  /** The result of the request */
  result?: string | number
}

export interface Paginated {
  /** Total number of results */
  count: number
  /** Number of results per page */
  pageSize: number
  /** Total number of pages */
  totalPages: number
  /** Current page number */
  current: number
}

export interface StreamerResponse {
  /** Indicates if the request was successful */
  success: boolean
  /** Error message if the request was not successful */
  message?: string
  /** Streamer data */
  result?: StreamerDto | StreamerDto[]
  /** Pagination data */
  pagination?: Paginated
}
