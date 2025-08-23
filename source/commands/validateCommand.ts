import { Command } from 'commander';
import pkg from 'ajv';
const { default: Ajv } = pkg;
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function createValidateCommand() {
  const cmd = new Command('validate')
    .description('Validate a navigation.json file against the schema with extra checks')
    .argument('<file>', 'Path to navigation.json')
    .option('--strict', 'Exit with failure code on validation errors', false)
    .action(async (file: string, options: { strict?: boolean }) => {
      try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        let schemaPath = path.join(__dirname, '../schemas/navigation.schema.json');
        try {
          await fs.access(schemaPath);
        } catch {
          // Fallback to source schema when running from repo
          const repoRoot = path.resolve(__dirname, '..', '..');
          schemaPath = path.join(repoRoot, 'source', 'schemas', 'navigation.schema.json');
        }
        const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));
        const data = JSON.parse(await fs.readFile(path.resolve(file), 'utf8'));

        const ajv = new Ajv({ allErrors: true, strict: true });
        const validate = ajv.compile(schema);
        const ok = validate(data);

        const errors: string[] = [];
        if (!ok && validate.errors) {
          for (const e of validate.errors) {
            errors.push(`Schema: ${e.instancePath} ${e.message}`);
          }
        }

        // Custom: ensure sibling categories have unique English slug per parent
        const customErrors: string[] = [];
        const check = (nodes: any[], pathParts: string[]) => {
          const map = new Map<string, number>();
          for (const n of nodes || []) {
            if (n?.type === 'category') {
              const key = typeof n.slug === 'string' ? n.slug : n.slug?.en || '';
              if (key) map.set(key, (map.get(key) || 0) + 1);
            }
          }
          for (const [k, count] of map) {
            if (count > 1) customErrors.push(`Duplicate category englishSlug '${k}' at ${pathParts.join(' > ')}`);
          }
          for (const n of nodes || []) if (n?.type === 'category') check(n.children || [], [...pathParts, n.name?.en || '(category)']);
        };
        for (const sec of data.navbar || []) check(sec.categories || [], [sec.documentation || 'section']);

        const allErrors = [...errors, ...customErrors];
        if (allErrors.length === 0) {
          console.log('✅ navigation.json is valid');
        } else {
          console.error('❌ Validation failed:');
          for (const err of allErrors) console.error(' -', err);
        }

        if (options.strict && allErrors.length > 0) process.exit(1);
      } catch (err) {
        console.error('❌ Validation error:', err);
        process.exit(1);
      }
    });

  return cmd;
}

