import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { skillContractV2 } from './skill-contract.mjs';
export const schemaText = () => JSON.stringify(z.toJSONSchema(skillContractV2), null, 2) + '\n';
if (process.argv[1]?.endsWith('/export-skill-schema.mjs'))
  await writeFile('../plugins/bytesskills-core/skills/bytes/contracts/skill.schema.json', schemaText());
