export * from "./services"

import { IEventBusService } from "@medusajs/types"

export type InitializeModuleInjectableDependencies = {
  eventBusService?: IEventBusService
}
