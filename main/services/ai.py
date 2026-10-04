import os
from openai import (
    OpenAI,
    APITimeoutError,
    APIConnectionError,
    APIStatusError,
)
from pydantic import BaseModel


class TaskBreakdown(BaseModel):
    steps: list[str]


class AIServiceUnavailable(Exception):
    pass

class AIServiceTimeout(Exception):
    pass

class AIInvalidResponse(Exception):
    pass


def breakdown_task(task):
    api_key = os.getenv("OPENAI_API_KEY")

    if not api_key:
        raise AIServiceUnavailable()

    client = OpenAI(
        api_key=api_key,
        timeout=10.0,
        max_retries=0,
    )

    try:
        response = client.responses.parse(
            model="gpt-6-luna",
            input=f"""
            Break the following task into 3-5 simple, concrete steps.

            Title: {task.title}
            Description: {task.description}
            """,
            text_format=TaskBreakdown,
        )
    except APITimeoutError:
        raise AIServiceTimeout()
    except APIConnectionError:
        raise AIServiceUnavailable()
    except APIStatusError:
        raise AIServiceUnavailable()

    result = response.output_parsed

    if result is None:
        raise AIInvalidResponse()

    steps = [step.strip() for step in result.steps]

    if not 3 <= len(steps) <= 5:
        raise AIInvalidResponse()

    if any(not step for step in steps):
        raise AIInvalidResponse()

    return {
        "steps": steps
    }