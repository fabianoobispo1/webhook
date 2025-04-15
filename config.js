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
      id: 'beautitechapihml',
      name: 'beautitechapihml',
      path: '/root/projetos/bruvii/hml/backend',
      branch: 'main',
      source: 'gitlab',
      commands: [
        'git pull origin main',
        'npm install',
        'pm2 restart beautitech-api-hml'
      ]
    },
    {
      id: 'beautitechwebhml',
      name: 'beautitechwebhml',
      path: '/root/projetos/bruvii/hml/frontend',
      branch: 'main',
      source: 'gitlab',
      commands: [
        'git pull origin main',
        'cp -R /root/projetos/bruvii/hml/frontend/* /var/www/beautitech.hml.bruvii.com/',
        
      ]
    }
  ]
};

/* 
rm -rf vendor
rsync -av --exclude='.env' /root/projetos/bruvii/hml/frontend/ /var/www/beautitech.hml.bruvii.com/


Send command to Terminal
Clear Composer's cache:
composer clear-cache


Send command to Terminal
Reinstall dependencies:
composer install */
