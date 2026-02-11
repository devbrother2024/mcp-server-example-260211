import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { InferenceClient } from '@huggingface/inference'
import { z } from 'zod'

export function registerGenerateImageTool(server: McpServer) {
    server.registerTool(
        'generate-image',
        {
            description:
                '텍스트 프롬프트를 입력하면 HuggingFace Inference API(FLUX.1-schnell 모델)를 사용하여 이미지를 생성합니다. 환경변수 HF_TOKEN이 필요합니다.',
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
            const hfToken = process.env.HF_TOKEN
            if (!hfToken) {
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: 'HF_TOKEN 환경변수가 설정되지 않았습니다. Vercel 프로젝트 설정에서 HF_TOKEN을 추가해주세요.'
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
}
