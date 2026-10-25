// Gera hashes bcrypt LOCALMENTE para senha e respostas de recuperação.
// Uso interativo:
//   npm run hash                (pergunta a senha com entrada oculta)
//   npm run hash -- --answer    (pergunta a resposta de recuperação)
//
// Uso direto via linha de comando:
//   npm run hash "minha-senha"
//   npm run hash --answer "minha-resposta"
import bcrypt from 'bcryptjs';
import { normalizeAnswer, BCRYPT_COST } from '../server/auth';

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    if (!stdin.isTTY) {
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

async function main() {
  const rawArgs = process.argv.slice(2);
  const isAnswer = rawArgs.includes('--answer');

  // Filtra flags conhecidas
  const otherArgs = rawArgs.filter((a) => a !== '--answer');

  let value = '';

  if (otherArgs.length > 0) {
    // Se o usuário passou diretamente como argumento (ex.: npm run hash "minha-senha" ou --minha-senha)
    let candidate = otherArgs.join(' ');
    // Se digitou acidentalmente com traços no início (ex.: --maria), remove os traços
    if (candidate.startsWith('--')) {
      candidate = candidate.replace(/^--+/, '');
    }
    value = candidate;
    console.log(`\nGerando hash para ${isAnswer ? 'resposta de recuperação' : 'senha'} informada via argumento...`);
  } else {
    const label = isAnswer ? 'Resposta de recuperação' : 'Senha';
    const first = await ask(`${label} (a entrada não é exibida): `);
    const second = await ask('Repita: ');
    if (first !== second || first.length === 0) {
      console.error('\nOs valores não conferem (ou estão vazios). Nada foi gerado.');
      process.exit(1);
    }
    value = first;
  }

  if (!value || value.trim().length === 0) {
    console.error('\nNenhum valor informado. Nada foi gerado.');
    process.exit(1);
  }

  const finalValue = isAnswer ? normalizeAnswer(value) : value;
  const hash = await bcrypt.hash(finalValue, BCRYPT_COST);

  console.log('\n======================================================================');
  console.log(`HASH GERADO COM SUCESSO (${isAnswer ? 'RESPOSTA DE RECUPERAÇÃO' : 'SENHA'})`);
  console.log('======================================================================');
  console.log('\nCopie o hash abaixo (com as aspas simples) para a variável correspondente:\n');
  console.log(`'${hash}'\n`);
  console.log('Exemplo no .env.local ou na Vercel:');
  if (isAnswer) {
    console.log(`ADMIN_RECOVERY_ANSWER_1_HASH='${hash}'`);
  } else {
    console.log(`ADMIN_INITIAL_PASSWORD_HASH='${hash}'`);
  }
  console.log('======================================================================\n');
}

main().catch((err) => {
  console.error('\nErro ao gerar hash:', err);
  process.exit(1);
});
