import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

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

export function registerWeatherTool(server: McpServer) {
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

            const currentWeather = [
                `=== 현재 날씨 (${current.time}) ===`,
                `날씨: ${getWeatherDescription(current.weather_code)}`,
                `기온: ${current.temperature_2m}°C (체감 ${current.apparent_temperature}°C)`,
                `습도: ${current.relative_humidity_2m}%`,
                `풍속: ${current.wind_speed_10m} km/h (방향: ${current.wind_direction_10m}°)`,
                `강수량: ${current.precipitation} mm`
            ].join('\n')

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
}
