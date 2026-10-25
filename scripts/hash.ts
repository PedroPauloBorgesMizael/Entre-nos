// Gera hashes bcrypt LOCALMENTE para senha e respostas de recuperação.
// Uso:  npm run hash            (pergunta com entrada oculta)
//       npm run hash -- --answer  (aplica a normalização das respostas de recuperação)
import bcrypt from 'bcryptjs';
import { normalizeAnswer, BCRYPT_COST } from '../server/auth';

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      // entrada por pipe (ex.: automação): lê uma linha
      let buf = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (d) => {
        buf += d;
        if (buf.includes('\n')) {
          stdin.pause();
          resolve(buf.split(/\r?\n/)[0] ?? '');
        }
      });
      return;
    }
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (c === '\u0003') process.exit(130);
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on('data', onData);
  });
}

const isAnswer = process.argv.includes('--answer');
const label = isAnswer ? 'Resposta de recuperação' : 'Senha';
const first = await ask(`${label} (a entrada não é exibida): `);
const second = await ask('Repita: ');
if (first !== second || first.length === 0) {
  console.error('\nOs valores não conferem (ou estão vazios). Nada foi gerado.');
  process.exit(1);
}
const hash = await bcrypt.hash(isAnswer ? normalizeAnswer(first) : first, BCRYPT_COST);
console.log('\nCopie o hash abaixo, exatamente como está, para a variável de ambiente correspondente');
console.log('(no .env.local use aspas simples ao redor, por causa dos "$"):\n');
console.log(hash);
