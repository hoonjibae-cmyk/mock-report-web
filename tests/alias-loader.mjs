// Node 테스트 러너용 경로 해석기.
//
// 소스는 tsconfig의 "@/..." 별칭을 쓰는데 Node는 그 규칙을 모른다. 이 로더가
// "@/"를 프로젝트 최상위로 바꾸고 확장자(.ts/.tsx)를 붙여 준다. 테스트를
// 돌리자고 소스의 import를 상대경로로 바꾸지 않기 위한 것이며, 별도 패키지를
// 설치하지 않아도 된다.
//
// 사용: node --experimental-strip-types --import ./tests/alias-loader.mjs --test tests/*.test.ts

import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { register } from "node:module";

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");
const EXTENSIONS = ["", ".ts", ".tsx", ".js", "/index.ts", "/index.tsx"];

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = resolvePath(ROOT, specifier.slice(2));
    for (const ext of EXTENSIONS) {
      if (existsSync(base + ext)) return { url: pathToFileURL(base + ext).href, shortCircuit: true };
    }
  }
  // 상대경로도 확장자 없이 쓸 수 있게 해 준다(테스트 코드 가독성)
  if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    const base = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier);
    for (const ext of EXTENSIONS.slice(1)) {
      if (existsSync(base + ext)) return { url: pathToFileURL(base + ext).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}

register(import.meta.url, import.meta.url);
