import { createMcpHandler } from 'mcp-handler'
import { registerTools } from '@/src'

const handler = createMcpHandler(
    (server) => {
        registerTools(server)
    },
    {},
    {
        basePath: '/api',
        verboseLogs: true
    }
)

export { handler as GET, handler as POST, handler as DELETE }
