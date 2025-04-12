const express = require('express');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Verificar se o arquivo de configuração existe
const configPath = path.join(__dirname, 'config.js');
let config;

try {
  if (fs.existsSync(configPath)) {
    config = require('./config');
  } else {
    // Configuração padrão se o arquivo não existir
    config = {
      port: process.env.PORT || 3100,
      secretKey: process.env.SECRET_KEY || 'chave_padrao',
      projects: []
    };
    
    // Criar arquivo de configuração
    fs.writeFileSync(
      configPath,
      `module.exports = ${JSON.stringify(config, null, 2)};`
    );
    
    console.log('Arquivo de configuração criado com valores padrão');
  }
} catch (error) {
  console.error('Erro ao carregar configuração:', error);
  process.exit(1);
}

const app = express();


// Middleware para analisar JSON com tratamento de erro
app.use(bodyParser.json({
  verify: (req, res, buf, encoding) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      res.status(400).json({ error: 'Payload inválido' });
      throw new Error('Payload inválido');
    }
  }
}));

// Middleware para tratamento global de erros
app.use((err, req, res, next) => {
  console.error('Erro na aplicação:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// Adicione este middleware no início para logar todas as requisições
app.use((req, res, next) => {
  console.log('=== Nova Requisição ===');
  console.log(`Método: ${req.method}`);
  console.log(`URL: ${req.url}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  
  // Capturar e logar o corpo da requisição
  let data = '';
  req.on('data', chunk => {
    data += chunk;
  });
  
  req.on('end', () => {
    console.log('Corpo da requisição:', data);
    // Armazenar o corpo bruto para uso posterior
    req.rawBody = data;
    next();
  });
});

// Função para verificar a assinatura do GitLab
function verifySignature(req) {
  try {
    const token = req.headers['x-gitlab-token'];
    return token === config.secretKey;
  } catch (error) {
    console.error('Erro ao verificar assinatura:', error);
    return false;
  }
}

// Função para executar comandos em sequência
function executeCommands(commands, cwd) {
  return new Promise((resolve, reject) => {
    const executeNext = (index) => {
      if (index >= commands.length) {
        return resolve();
      }
      
      console.log(`Executando: ${commands[index]}`);
      
      exec(commands[index], { cwd }, (error, stdout, stderr) => {
        if (error) {
          console.error(`Erro ao executar comando: ${error}`);
          return reject(error);
        }
        
        console.log(`Saída: ${stdout}`);
        
        if (stderr) {
          console.error(`Erro: ${stderr}`);
        }
        
        executeNext(index + 1);
      });
    };
    
    executeNext(0);
  });
}

// Rota principal para receber webhooks
app.post('/webhook/:projectId', async (req, res) => {
  try {
    // Verificar a assinatura
    if (!verifySignature(req)) {
      console.error('Assinatura inválida');
      return res.status(401).json({ error: 'Assinatura inválida' });
    }
    
    const projectId = req.params.projectId;
    const project = config.projects.find(p => p.id === projectId);
    
    if (!project) {
      console.error(`Projeto não encontrado: ${projectId}`);
      return res.status(404).json({ error: 'Projeto não encontrado' });
    }
    
    // Verificar se o push é para a branch correta
    const payload = req.body;
    const branch = payload.ref ? payload.ref.replace('refs/heads/', '') : '';
    
    if (branch !== project.branch) {
      console.log(`Ignorando push para branch ${branch}, esperando ${project.branch}`);
      return res.json({ message: `Ignorando push para branch ${branch}` });
    }
    
    // Responder imediatamente para não bloquear o GitLab
    res.json({ message: `Iniciando deploy para ${project.name}` });
    
    // Executar os comandos de deploy
    try {
      console.log(`Iniciando deploy para ${project.name}`);
      await executeCommands(project.commands, project.path);
      console.log(`Deploy concluído para ${project.name}`);
    } catch (error) {
      console.error(`Erro no deploy para ${project.name}: ${error}`);
    }
  } catch (error) {
    console.error('Erro ao processar webhook:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
});





// Função para verificar a assinatura do GitHub
function verifyGitHubSignature(req) {
  try {
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) {
      return false;
    }
    
    const secret = config.secretKey;
    const payload = JSON.stringify(req.body);
    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(digest)
    );
  } catch (error) {
    console.error('Erro ao verificar assinatura do GitHub:', error);
    return false;
  }
}

// Rota para webhooks do GitHub
app.post('/github/:projectId', async (req, res) => {
  try {
    // Verificar a assinatura
    if (!verifyGitHubSignature(req)) {
      console.error('Assinatura do GitHub inválida');
      return res.status(401).json({ error: 'Assinatura inválida' });
    }
    
    const projectId = req.params.projectId;
    const project = config.projects.find(p => p.id === projectId);
    
    if (!project) {
      console.error(`Projeto não encontrado: ${projectId}`);
      return res.status(404).json({ error: 'Projeto não encontrado' });
    }
    
    // Verificar se o evento é um push
    const event = req.headers['x-github-event'];
    if (event !== 'push') {
      console.log(`Ignorando evento ${event}, esperando push`);
      return res.json({ message: `Evento ${event} ignorado` });
    }
    
    // Verificar se o push é para a branch correta
    const payload = req.body;
    const ref = payload.ref;
    const branch = ref ? ref.replace('refs/heads/', '') : '';
    
    if (branch !== project.branch) {
      console.log(`Ignorando push para branch ${branch}, esperando ${project.branch}`);
      return res.json({ message: `Ignorando push para branch ${branch}` });
    }
    
    // Responder imediatamente para não bloquear o GitHub
    res.status(202).json({ message: `Iniciando deploy para ${project.name}` });
    
    // Executar os comandos de deploy
    try {
      console.log(`Iniciando deploy para ${project.name} (acionado pelo GitHub)`);
      await executeCommands(project.commands, project.path);
      console.log(`Deploy concluído para ${project.name}`);
    } catch (error) {
      console.error(`Erro no deploy para ${project.name}: ${error}`);
    }
  } catch (error) {
    console.error('Erro ao processar webhook do GitHub:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
});


// Rota de status
app.get('/status', (req, res) => {
  try {
    res.json({
      status: 'online',
      projects: config.projects.map(p => ({ id: p.id, name: p.name }))
    });
  } catch (error) {
    console.error('Erro ao verificar status:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Tratamento para rotas não encontradas
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Iniciar o servidor com tratamento de erro
const server = app.listen(config.port, () => {
  console.log(`Servidor de webhook rodando na porta ${config.port}`);
}).on('error', (error) => {
  console.error('Erro ao iniciar o servidor:', error);
  process.exit(1);
});

// Tratamento de sinais para encerramento gracioso
process.on('SIGTERM', () => {
  console.log('Recebido SIGTERM. Encerrando servidor...');
  server.close(() => {
    console.log('Servidor encerrado.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Recebido SIGINT. Encerrando servidor...');
  server.close(() => {
    console.log('Servidor encerrado.');
    process.exit(0);
  });
});

// Tratamento de exceções não capturadas
process.on('uncaughtException', (error) => {
  console.error('Exceção não capturada:', error);
  // Não encerrar o processo para que o PM2 não precise reiniciar
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Rejeição não tratada em:', promise, 'razão:', reason);
  // Não encerrar o processo para que o PM2 não precise reiniciar
});
