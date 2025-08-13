import pkg from 'ajv';
const { default: Ajv } = pkg;
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function validateNavigationSchema(dataPath: string): Promise<boolean> {
  try {
    // Load the schema
    const schemaPath = path.join(__dirname, '../schemas/navigation.schema.json');
    const schemaContent = await fs.readFile(schemaPath, 'utf-8');
    const schema = JSON.parse(schemaContent);
    
    // Load the data
    const dataContent = await fs.readFile(dataPath, 'utf-8');
    const data = JSON.parse(dataContent);
    
    // Create validator
    const ajv = new Ajv({ 
      allErrors: true,
      verbose: true 
    });
    
    const validate = ajv.compile(schema);
    const valid = validate(data);
    
    if (valid) {
      console.log(chalk.green('✅ Navigation file is valid according to schema'));
      return true;
    } else {
      console.log(chalk.red('❌ Navigation file validation failed:'));
      if (validate.errors) {
        validate.errors.forEach((error: any) => {
          console.log(chalk.yellow(`  - ${error.instancePath || '/'}: ${error.message}`));
          if (error.params) {
            console.log(chalk.gray(`    Details: ${JSON.stringify(error.params)}`));
          }
        });
      }
      return false;
    }
  } catch (error) {
    console.error(chalk.red(`Error validating schema: ${error}`));
    return false;
  }
}

