import { AwilixContainer } from "awilix"
import { Logger as _Logger } from "winston"
import { LoggerOptions } from "typeorm"
import { Customer, User } from "../models"
import { FindConfig, QueryTypedClass } from "./common"

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User | Customer
      scope: MedusaContainer
      validatedQuery: QueryTypedClass & Record<string, unknown>
      validatedBody: unknown
      listConfig: FindConfig<unknown>
      retrieveConfig: FindConfig<unknown>
      filterableFields: Record<string, unknown>
    }
  }
}

export type ClassConstructor<T> = {
  new (...args: unknown[]): T
}

export type MedusaContainer = AwilixContainer & {
  registerAdd: <T>(name: string, registration: T) => MedusaContainer
}

export type Logger = _Logger & {
  progress: (activityId: string, msg: string) => void
}

export type ConfigModule = {
  projectConfig: {
    redis_url?: string

    jwt_secret?: string
    cookie_secret?: string

    database_url?: string
    database_type: string
    database_database?: string
    database_logging: LoggerOptions

    database_extra?: Record<string, unknown> & {
      ssl: { rejectUnauthorized: false }
    }
    store_cors?: string
    admin_cors?: string
  }
  plugins: (
    | {
        resolve: string
        options: Record<string, unknown>
      }
    | string
  )[]
}
