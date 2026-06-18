import pino from "pino";
import { vars } from "./vars";

export const logger = pino({
  level: vars.logLevel,
  transport: vars.isProd ? undefined : { target: "pino-pretty", options: { colorize: true } },
});
