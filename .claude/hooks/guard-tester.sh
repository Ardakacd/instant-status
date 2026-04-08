#!/bin/bash

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.path // .tool_input.file_path // empty')

if [ -z "$FILE" ]; then
  exit 0
fi

# Must be in backend/ or mobile/
if [[ "$FILE" != *"/backend/"* ]] && \
   [[ "$FILE" != "backend/"* ]] && \
   [[ "$FILE" != *"/mobile/"* ]] && \
   [[ "$FILE" != "mobile/"* ]]; then
  echo "❌ Blocked: tester-teammate can only work in backend/ or mobile/" >&2
  exit 2
fi

# Must be a test file or test directory
if [[ "$FILE" != *.spec.ts ]] && \
   [[ "$FILE" != *.spec.tsx ]] && \
   [[ "$FILE" != *.test.ts ]] && \
   [[ "$FILE" != *.test.tsx ]] && \
   [[ "$FILE" != *"/test/"* ]] && \
   [[ "$FILE" != *"/__tests__/"* ]]; then
  echo "❌ Blocked: tester-teammate can only edit test files" >&2
  exit 2
fi

exit 0