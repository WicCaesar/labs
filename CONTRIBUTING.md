# 🤝 Guia de Contribuição

Obrigado por considerar contribuir com o **Vitrolinha do Tempo**! Este documento fornece diretrizes para tornar o processo de contribuição claro e eficiente.

## 📋 Índice

- [Como Contribuir](#como-contribuir)
- [Configuração do Ambiente](#configuração-do-ambiente)
- [Processo de Desenvolvimento](#processo-de-desenvolvimento)
- [Padrões de Código](#padrões-de-código)
- [Commits](#commits)
- [Pull Requests](#pull-requests)

## 🚀 Como Contribuir

Existem várias formas de contribuir:

- 🐛 **Reportar bugs**: Abra uma issue descrevendo o problema
- 💡 **Sugerir funcionalidades**: Compartilhe suas ideias através de issues
- 📝 **Melhorar documentação**: Corrija ou expanda a documentação
- 💻 **Contribuir com código**: Implemente features ou corrija bugs

## ⚙️ Configuração do Ambiente

### Pré-requisitos

- Node.js 18+ e npm
- Git

### Instalação

1. **Fork e clone o repositório**
   ```bash
   git clone https://github.com/seu-usuario/vitrolinha-do-tempo.git
   cd vitrolinha-do-tempo
   ```

2. **Instale as dependências**
   ```bash
   npm install
   ```

3. **Inicie o servidor de desenvolvimento**
   ```bash
   npm run dev
   ```
   O projeto estará disponível em `http://localhost:8080`

## 🔄 Processo de Desenvolvimento

1. **Crie uma branch para sua feature**
   ```bash
   git checkout -b feature/nome-da-feature
   ```

2. **Faça suas alterações**
   - Escreva código claro e bem documentado
   - Teste suas alterações localmente

3. **Commit suas alterações**
   ```bash
   git add .
   git commit -m "feat: adiciona nova funcionalidade"
   ```

4. **Push para seu fork**
   ```bash
   git push origin feature/nome-da-feature
   ```

5. **Abra um Pull Request**

## 📐 Padrões de Código

### TypeScript

- Use TypeScript sempre que possível
- Mantenha funções pequenas e focadas
- Use tipos explícitos quando não for óbvio

### Estrutura do Projeto

```
├── src/                # Código-fonte
│   ├── game/          # Lógica do jogo Phaser
│   │   ├── scenes/    # Cenas do jogo
│   │   └── main.ts    # Configuração principal
│   └── main.ts        # Ponto de entrada
├── public/            # Arquivos estáticos
│   └── assets/       # Assets do jogo
├── config/           # Configurações do Vite
└── build/           # Build de produção (gerado)
```

## 📝 Commits

Seguimos a convenção [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` Nova funcionalidade
- `fix:` Correção de bug
- `docs:` Mudanças na documentação
- `style:` Formatação de código
- `refactor:` Refatoração de código
- `test:` Adição ou correção de testes
- `chore:` Tarefas de manutenção

**Exemplos:**
```bash
feat: adiciona sistema de pontuação
fix: corrige bug na animação de sprites
docs: atualiza README com novas instruções
```

## 🔍 Pull Requests

### Checklist

- [ ] O código está funcionando localmente
- [ ] Segui os padrões de código do projeto
- [ ] Atualizei a documentação se necessário
- [ ] Meus commits seguem a convenção estabelecida

### Descrição do PR

Use este template:

```markdown
## Descrição
Breve descrição das mudanças

## Tipo de mudança
- [ ] Bug fix
- [ ] Nova feature
- [ ] Breaking change
- [ ] Documentação

## Como testar
1. Passo 1
2. Passo 2
```

## ❓ Dúvidas

Se tiver dúvidas, abra uma issue com a tag `question`.

---

**Obrigado por contribuir! 🎉**