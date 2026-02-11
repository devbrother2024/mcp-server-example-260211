import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { InferenceClient } from '@huggingface/inference'
import { z } from 'zod'

// Session Configuration Schema
// HF_TOKEN을 헤더로 받아 이미지 생성 도구에서 사용
export const configSchema = z.object({
    hfToken: z
        .string()
        .optional()
        .describe('HuggingFace API Token (이미지 생성에 필요)')
})

// Smithery createServer 패턴
export default function createServer({
    config
}: {
    config: z.infer<typeof configSchema>
}) {
    const server = new McpServer({
        name: 'mcp-server-example',
        version: '1.0.0'
    })

    // Greet Tool
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
            }),
            outputSchema: z.object({
                content: z
                    .array(
                        z.object({
                            type: z.literal('text'),
                            text: z.string().describe('인사말')
                        })
                    )
                    .describe('인사말')
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
                ],
                structuredContent: {
                    content: [
                        {
                            type: 'text' as const,
                            text: greeting
                        }
                    ]
                }
            }
        }
    )

    // Nominatim OpenStreetMap Geocoding Tool
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

    // Open-Meteo Weather API Tool
    const WMO_WEATHER_CODES: Record<number, string> = {
        0: '맑음 (Clear sky)',
        1: '대체로 맑음 (Mainly clear)',
        2: '부분적 흐림 (Partly cloudy)',
        3: '흐림 (Overcast)',
        45: '안개 (Fog)',
        48: '상고대 안개 (Depositing rime fog)',
        51: '가벼운 이슬비 (Light drizzle)',
        53: '보통 이슬비 (Moderate drizzle)',
        55: '강한 이슬비 (Dense drizzle)',
        56: '가벼운 진눈깨비 (Light freezing drizzle)',
        57: '강한 진눈깨비 (Dense freezing drizzle)',
        61: '약한 비 (Slight rain)',
        63: '보통 비 (Moderate rain)',
        65: '강한 비 (Heavy rain)',
        66: '약한 어는 비 (Light freezing rain)',
        67: '강한 어는 비 (Heavy freezing rain)',
        71: '약한 눈 (Slight snowfall)',
        73: '보통 눈 (Moderate snowfall)',
        75: '강한 눈 (Heavy snowfall)',
        77: '눈 알갱이 (Snow grains)',
        80: '약한 소나기 (Slight rain showers)',
        81: '보통 소나기 (Moderate rain showers)',
        82: '강한 소나기 (Violent rain showers)',
        85: '약한 눈 소나기 (Slight snow showers)',
        86: '강한 눈 소나기 (Heavy snow showers)',
        95: '뇌우 (Thunderstorm)',
        96: '약한 우박 뇌우 (Thunderstorm with slight hail)',
        99: '강한 우박 뇌우 (Thunderstorm with heavy hail)'
    }

    function getWeatherDescription(code: number): string {
        return WMO_WEATHER_CODES[code] ?? `알 수 없음 (code: ${code})`
    }

    interface CurrentWeatherResponse {
        current: {
            time: string
            temperature_2m: number
            relative_humidity_2m: number
            apparent_temperature: number
            weather_code: number
            wind_speed_10m: number
            wind_direction_10m: number
            precipitation: number
        }
        daily: {
            time: string[]
            weather_code: number[]
            temperature_2m_max: number[]
            temperature_2m_min: number[]
            precipitation_sum: number[]
            precipitation_probability_max: number[]
            wind_speed_10m_max: number[]
        }
    }

    server.registerTool(
        'get-weather',
        {
            description:
                '위도와 경도 좌표를 입력하면 Open-Meteo API를 사용하여 현재 날씨와 일별 예보를 반환합니다. geocode 도구와 함께 사용하면 도시 이름으로 날씨를 조회할 수 있습니다.',
            inputSchema: z.object({
                latitude: z
                    .number()
                    .min(-90)
                    .max(90)
                    .describe('위도 (-90 ~ 90)'),
                longitude: z
                    .number()
                    .min(-180)
                    .max(180)
                    .describe('경도 (-180 ~ 180)'),
                forecast_days: z
                    .number()
                    .int()
                    .min(1)
                    .max(16)
                    .optional()
                    .default(3)
                    .describe('예보 일수 (1~16, 기본값: 3)')
            })
        },
        async ({ latitude, longitude, forecast_days }) => {
            const url = new URL('https://api.open-meteo.com/v1/forecast')
            url.searchParams.set('latitude', String(latitude))
            url.searchParams.set('longitude', String(longitude))
            url.searchParams.set(
                'current',
                'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,precipitation'
            )
            url.searchParams.set(
                'daily',
                'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max'
            )
            url.searchParams.set('timezone', 'auto')
            url.searchParams.set('forecast_days', String(forecast_days))

            const response = await fetch(url.toString())

            if (!response.ok) {
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `Open-Meteo API 요청 실패: ${response.status} ${response.statusText}`
                        }
                    ]
                }
            }

            const data =
                (await response.json()) as CurrentWeatherResponse
            const { current, daily } = data

            // 현재 날씨 포맷팅
            const currentWeather = [
                `=== 현재 날씨 (${current.time}) ===`,
                `날씨: ${getWeatherDescription(current.weather_code)}`,
                `기온: ${current.temperature_2m}°C (체감 ${current.apparent_temperature}°C)`,
                `습도: ${current.relative_humidity_2m}%`,
                `풍속: ${current.wind_speed_10m} km/h (방향: ${current.wind_direction_10m}°)`,
                `강수량: ${current.precipitation} mm`
            ].join('\n')

            // 일별 예보 포맷팅
            const dailyForecast = daily.time
                .map((date, i) => {
                    return [
                        `--- ${date} ---`,
                        `날씨: ${getWeatherDescription(daily.weather_code[i])}`,
                        `최고: ${daily.temperature_2m_max[i]}°C / 최저: ${daily.temperature_2m_min[i]}°C`,
                        `강수량: ${daily.precipitation_sum[i]} mm (확률: ${daily.precipitation_probability_max[i]}%)`,
                        `최대 풍속: ${daily.wind_speed_10m_max[i]} km/h`
                    ].join('\n')
                })
                .join('\n\n')

            const result = [
                `좌표: ${latitude}, ${longitude}`,
                '',
                currentWeather,
                '',
                `=== ${forecast_days}일 예보 ===`,
                '',
                dailyForecast
            ].join('\n')

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: result
                    }
                ]
            }
        }
    )

    // HuggingFace Image Generation Tool (FLUX.1-schnell via Together)
    server.registerTool(
        'generate-image',
        {
            description:
                '텍스트 프롬프트를 입력하면 HuggingFace Inference API(FLUX.1-schnell 모델)를 사용하여 이미지를 생성합니다. configSchema의 hfToken이 필요합니다.',
            inputSchema: z.object({
                prompt: z
                    .string()
                    .describe(
                        '이미지 생성 프롬프트 (예: "A cat sitting on a cloud", "Astronaut riding a horse")'
                    ),
                num_inference_steps: z
                    .number()
                    .int()
                    .min(1)
                    .max(10)
                    .optional()
                    .default(4)
                    .describe(
                        '추론 스텝 수 (1~10, 기본값: 4). FLUX.1-schnell은 낮은 값에서도 좋은 결과를 냅니다.'
                    )
            })
        },
        async ({ prompt, num_inference_steps }) => {
            const hfToken = config?.hfToken || process.env.HF_TOKEN
            if (!hfToken) {
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: 'HF_TOKEN이 설정되지 않았습니다. Smithery 설정에서 hfToken을 입력하거나 HF_TOKEN 환경변수를 설정해주세요.'
                        }
                    ]
                }
            }

            try {
                const client = new InferenceClient(hfToken)

                const image = await client.textToImage(
                    {
                        provider: 'together',
                        model: 'black-forest-labs/FLUX.1-schnell',
                        inputs: prompt,
                        parameters: { num_inference_steps }
                    },
                    { outputType: 'blob' }
                )

                const arrayBuffer = await image.arrayBuffer()
                const base64 =
                    Buffer.from(arrayBuffer).toString('base64')

                return {
                    content: [
                        {
                            type: 'image' as const,
                            data: base64,
                            mimeType: 'image/png'
                        }
                    ]
                }
            } catch (error) {
                const message =
                    error instanceof Error
                        ? error.message
                        : String(error)
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `이미지 생성 실패: ${message}`
                        }
                    ]
                }
            }
        }
    )

    return server.server
}
