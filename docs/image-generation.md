# Image generation quickstart

Use the OpenAI Images API to generate pictures from text prompts. The examples below show how to request a single 1024x1024 image and print its URL. Replace the prompt text with what you want to see.

## Prerequisites

- Install the OpenAI SDK for your language (e.g., `npm i openai` or `pip install openai`).
- Set `OPENAI_API_KEY` in your environment.

## TypeScript/JavaScript example

```ts
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function main() {
  const response = await client.images.generate({
    model: "gpt-image-1",
    prompt: "a scenic lake at sunrise with soft mist",
    size: "1024x1024",
  });

  const imageUrl = response.data[0].url;
  console.log("Image URL:", imageUrl);
}

main().catch(console.error);
```

## Python example

```python
from pathlib import Path
from base64 import b64decode
from openai import OpenAI

client = OpenAI()

response = client.images.generate(
    model="gpt-image-1",
    prompt="a scenic lake at sunrise with soft mist",
    size="1024x1024",
)

image_b64 = response.data[0].b64_json
output_path = Path("generated.png")
output_path.write_bytes(b64decode(image_b64))
print(f"Saved to {output_path}")
```

## Command-line example

You can also call the Images API directly with `curl`:

```bash
curl https://api.openai.com/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-image-1",
    "prompt": "a scenic lake at sunrise with soft mist",
    "size": "1024x1024"
  }'
```

This returns JSON that includes a URL (or `b64_json`) for the generated image. Download the URL or decode the base64 string to save the picture locally.
