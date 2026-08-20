import os
from dotenv import load_dotenv
from openai import AzureOpenAI

load_dotenv()

client = AzureOpenAI(
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
    api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-15-preview"),
)

try:
    response = client.chat.completions.create(
        model=os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-5.4-mini"),
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": "You are a clinical data extraction assistant. Return ONLY a valid JSON object."},
            {"role": "user", "content": "Patient has a headache."},
        ],
        temperature=0.1,
        max_tokens=800,
    )
    print("SUCCESS")
    print(response.choices[0].message.content)
except Exception as e:
    import traceback
    traceback.print_exc()
    print(f"\nERROR: {str(e)}")
