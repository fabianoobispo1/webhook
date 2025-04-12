const express = require('express');
const crypto = require('crypto');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Carregar configuração
const configPath = path.join(__dirname, 'config.js');
let config;

try {
  if (fs.existsSync(configPath)) {
    config = require('./config');
  } else {
    // Configuração padrão se o arquivo não existir
    config = {
      port: process.env.PORT || 9000,
      secretKey: process.env.SECRET_KEY || 'chave_padrao',
      projects: []
    };
    
    // Criar arquivo de configuração
    fs.writeFileSync(
      configPath,
      `module.exports = ${JSON.stringify(config, null, 2)};`
    );
    
    console.log('Arquivo de configuração criado com valores padrão.');
  }
} catch (error) {
  console.error('Erro ao carregar configuração:', error);
  process.exit(1);
}

const app = express();

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

// Middleware para verificar a assinatura do GitLab
function verifyGitLabSignature(req, res, next) {
  const token = req.headers['x-gitlab-token'];
  
  if (token !== config.secretKey) {
    console.error('Assinatura do GitLab inválida');
    return res.status(401).json({ error: 'Assinatura inválida' });
  }
  
  next();
}

// Middleware para capturar o corpo bruto para GitHub
function rawBodyParser(req, res, next) {
  req.rawBody = '';
  req.setEncoding('utf8');

  req.on('data', (chunk) => {
    req.rawBody += chunk;
  });

  req.on('end', () => {
    try {
      req.body = JSON.parse(req.rawBody);
      next();
    } catch (err) {
      console.error('Erro ao analisar JSON:', err);
      res.status(400).send('Payload inválido');
    }
  });
}

// Middleware para verificar a assinatura do GitHub
function verifyGitHubSignature(req, res, next) {
  const signature = req.headers['x-hub-signature-256'];
  
  if (!signature) {
    console.error('Cabeçalho x-hub-signature-256 ausente');
    return res.status(401).json({ error: 'Assinatura inválida' });
  }
  
  const hmac = crypto.createHmac('sha256', config.secretKey);
  const digest = 'sha256=' + hmac.update(req.rawBody).digest('hex');
  
  console.log(`Assinatura recebida: ${signature}`);
  console.log(`Assinatura calculada: ${digest}`);
  
  if (signature !== digest) {
    console.error('Assinatura do GitHub inválida');
    return res.status(401).json({ error: 'Assinatura inválida' });
  }
  
  next();
}

// Rota para webhooks do GitLab
app.post('/webhook/:projectId', express.json(), verifyGitLabSignature, async (req, res) => {
  try {
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
    console.error('Erro ao processar webhook do GitLab:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
});

// Rota para webhooks do GitHub
app.post('/github/:projectId', rawBodyParser, verifyGitHubSignature, async (req, res) => {
  try {
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
    const ref = req.body.ref;
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
app.get('/status', express.json(), (req, res) => {
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

// Rota de ping para GitHub (usada na configuração inicial do webhook)
app.post('/github/:projectId/ping', rawBodyParser, verifyGitHubSignature, (req, res) => {
  console.log('Recebido ping do GitHub');
  res.status(200).json({ message: 'pong' });
});

// Tratamento para rotas não encontradas
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Tratamento global de erros
app.use((err, req, res, next) => {
  console.error('Erro na aplicação:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
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
