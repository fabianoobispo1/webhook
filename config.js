module.exports = {
  // Porta em que o servidor vai rodar
  port: process.env.PORT || 3100,
  
  // Chave secreta para verificar assinaturas do GitLab
  secretKey: process.env.SECRET_KEY || 'chave_padrao',
  
  // Configuração dos projetos
  projects: [
    {
      id: 'webhook',
      name: 'Webhook',
      path: '/root/projetos/webhook',
      branch: 'main',
      source: 'github',
      commands: [
        'git pull origin main',
        'npm install',
        'pm2 restart webhook-server'
      ]
    },
    {
      id: 'beautitechapi',
      name: 'beautitechapi',
      path: '/root/projetos/bruvii/backend',
      branch: 'main',
      source: 'gitlab',
      commands: [
        'git pull origin main',
        'npm install',
        'pm2 restart beautitech-api'
      ]
    },
    {
      id: 'beautitechweb',
      name: 'beautitechweb',
      path: '/root/projetos/bruvii/frontend',
      branch: 'main',
      source: 'gitlab',
      commands: [
        'git pull origin main',
        'cp -R /root/projetos/bruvii/frontend/* /var/www/beautitech.bruvii.com/',
        
      ]
    }
  ]
};
