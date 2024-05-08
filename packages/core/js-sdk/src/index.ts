import { Admin } from "./admin"
import { Client } from "./client"
import { Store } from "./store"
import { Config } from "./types"

class Medusa {
  public client: Client
  public admin: Admin
  public store: Store

  constructor(config: Config) {
    this.client = new Client(config)
    this.admin = new Admin(this.client)
    this.store = new Store(this.client)
  }
}

export default Medusa
