import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerGreetTool } from './tools/greet'
import { registerGeocodeTool } from './tools/geocode'
import { registerWeatherTool } from './tools/weather'
import { registerGenerateImageTool } from './tools/generate-image'

export function registerTools(server: McpServer) {
    registerGreetTool(server)
    registerGeocodeTool(server)
    registerWeatherTool(server)
    registerGenerateImageTool(server)
}
