import glob from "glob"
import path from "path"
import { aliasTo, asFunction } from "awilix"

import formatRegistrationName from "../utils/format-registration-name"
import { MedusaContainer } from "../types/global"
import { isDefined } from "medusa-core-utils"
/*import { AbstractBatchJobStrategy } from "../interfaces"*/

type LoaderOptions = {
  container: MedusaContainer
  configModule: object
  isTest?: boolean
}

/**
 * Registers all strategies in the strategies directory
 * @returns void
 */
export default ({ container, configModule, isTest }: LoaderOptions): void => {
  const useMock = isDefined(isTest) ? isTest : process.env.NODE_ENV === "test"

  const corePath = useMock
    ? "../strategies/__mocks__/[!__]*.js"
    : "../strategies/**/[!__]*.js"

  const coreFull = path.join(__dirname, corePath)

  const ignore = [
    "**/__fixtures__/**",
    "**/index.js",
    "**/index.ts",
    "**/utils.js",
    "**/utils.ts",
    "**/types.js",
    "**/types.ts",
    "**/types/**",
  ]
  if (!useMock) {
    ignore.push("**/__tests__/**", "**/__mocks__/**")
  }

  const core = glob.sync(coreFull, {
    cwd: __dirname,
    ignore,
  })

  core.forEach((fn) => {
    const loaded = require(fn).default
    const name = formatRegistrationName(fn)

    container.register({
      [name]: asFunction(
        (cradle) => new loaded(cradle, configModule)
      ).singleton(),
    })
  })
}
