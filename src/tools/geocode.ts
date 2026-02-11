import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

export function registerGeocodeTool(server: McpServer) {
    server.registerTool(
        'geocode',
        {
            description:
                '도시 이름이나 주소를 입력하면 Nominatim OpenStreetMap API를 사용하여 위도/경도 좌표를 반환합니다.',
            inputSchema: z.object({
                query: z
                    .string()
                    .describe(
                        '검색할 도시 이름 또는 주소 (예: "Seoul", "서울특별시", "1600 Amphitheatre Parkway, Mountain View, CA")'
                    ),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(10)
                    .optional()
                    .default(3)
                    .describe('반환할 최대 결과 수 (1~10, 기본값: 3)')
            })
        },
        async ({ query, limit }) => {
            const url = new URL(
                'https://nominatim.openstreetmap.org/search'
            )
            url.searchParams.set('q', query)
            url.searchParams.set('format', 'json')
            url.searchParams.set('limit', String(limit))
            url.searchParams.set('addressdetails', '1')
            url.searchParams.set('accept-language', 'ko,en')

            const response = await fetch(url.toString(), {
                headers: {
                    'User-Agent': 'MCP-Geocode-Tool/1.0'
                }
            })

            if (!response.ok) {
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `Nominatim API 요청 실패: ${response.status} ${response.statusText}`
                        }
                    ]
                }
            }

            const results = (await response.json()) as Array<{
                lat: string
                lon: string
                display_name: string
                type: string
                address: Record<string, string>
            }>

            if (results.length === 0) {
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `"${query}"에 대한 검색 결과가 없습니다.`
                        }
                    ]
                }
            }

            const formatted = results
                .map((r, i) => {
                    return [
                        `[${i + 1}] ${r.display_name}`,
                        `    위도(lat): ${r.lat}`,
                        `    경도(lon): ${r.lon}`,
                        `    유형: ${r.type}`
                    ].join('\n')
                })
                .join('\n\n')

            const summary = `"${query}" 검색 결과 (${results.length}건):\n\n${formatted}`

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: summary
                    }
                ]
            }
        }
    )
}
