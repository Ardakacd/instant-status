#!/bin/bash

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.path // .tool_input.file_path // empty')

if [ -z "$FILE" ]; then
  exit 0
fi

# Block anything outside mobile/
if [[ "$FILE" != *"/mobile/"* ]] && [[ "$FILE" != "mobile/"* ]]; then
  echo "❌ Blocked: mobile-teammate can only edit files in mobile/" >&2
  exit 2
fi

# Block test files
if [[ "$FILE" == *.spec.ts ]] || \
   [[ "$FILE" == *.spec.tsx ]] || \
   [[ "$FILE" == *.test.ts ]] || \
   [[ "$FILE" == *.test.tsx ]] || \
   [[ "$FILE" == *"/test/"* ]] || \
   [[ "$FILE" == *"/__tests__/"* ]]; then
  echo "❌ Blocked: test files are owned by tester-teammate" >&2
  exit 2
fi

exit 0