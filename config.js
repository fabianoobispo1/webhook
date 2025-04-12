module.exports = {
  // Porta em que o servidor vai rodar
  port: process.env.PORT || 3100,
  
  // Chave secreta para verificar assinaturas do GitLab
  secretKey: process.env.SECRET_KEY || 'sua_chave_secreta_aqui',
  
  // Configuração dos projetos
  projects: [
    {
      id: 'webhook',
      name: 'Webhook',
      path: '/root/projetos/webhook',
      branch: 'main',
      commands: [
        'git pull origin main',
        'npm install',
        'pm2 restart webhook-server'
      ]
    }
  ]
};
