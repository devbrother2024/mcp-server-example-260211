import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

export function registerGreetTool(server: McpServer) {
    server.registerTool(
        'greet',
        {
            description: '이름과 언어를 입력하면 인사말을 반환합니다.',
            inputSchema: z.object({
                name: z.string().describe('인사할 사람의 이름'),
                language: z
                    .enum(['ko', 'en'])
                    .optional()
                    .default('en')
                    .describe('인사 언어 (기본값: en)')
            })
        },
        async ({ name, language }) => {
            const greeting =
                language === 'ko'
                    ? `안녕하세요, ${name}님!`
                    : `Hey there, ${name}! 👋 Nice to meet you!`

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: greeting
                    }
                ]
            }
        }
    )
}
