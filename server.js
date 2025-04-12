const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const { exec } = require('child_process');
const config = require('./config');

const app = express();

// Middleware para analisar JSON
app.use(bodyParser.json());

// Função para verificar a assinatura do GitLab
function verifySignature(req) {
  const token = req.headers['x-gitlab-token'];
  return token === config.secretKey;
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
});

// Rota de status
app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    projects: config.projects.map(p => ({ id: p.id, name: p.name }))
  });
});

// Iniciar o servidor
app.listen(config.port, () => {
  console.log(`Servidor de webhook rodando na porta ${config.port}`);
});
