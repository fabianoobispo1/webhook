module.exports = {
  // Porta em que o servidor vai rodar
  port: process.env.PORT || 9000,
  
  // Chave secreta para verificar assinaturas do GitLab
  secretKey: process.env.SECRET_KEY || 'sua_chave_secreta_aqui',
  
  // Configuração dos projetos
  projects: [
    {
      id: 'projeto1',
      name: 'Projeto 1',
      path: '/caminho/para/projeto1',
      branch: 'main',
      commands: [
        'git pull origin main',
        'npm install',
        'pm2 restart projeto1'
      ]
    }
  ]
};
