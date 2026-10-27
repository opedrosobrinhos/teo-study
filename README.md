# Estudos de Teologia

Plataforma que organiza três playlists do RTM Brasil em matérias, registra as aulas assistidas por pessoa (login com Google) e traz 3 perguntas de fixação por aula.

- **Curso Básico de Teologia** (265 aulas em 11 matérias: História da Igreja, Aconselhamento Bíblico, Hermenêutica, Pregação Expositiva, Panorama do AT, Teologia do NT, Introdução aos Estudos Teológicos, Teologia Sistemática I e II, Liderança, Introdução ao NT)
- **Teologia do Antigo Testamento** (22 aulas)
- **Disciplinas Espirituais** (11 aulas)

## Como funciona

- Os vídeos continuam hospedados no YouTube e tocam embutidos na página.
- O YouTube não permite que sites leiam o histórico de vídeos assistidos da conta Google. Por isso a plataforma mede sozinha: a aula é marcada como assistida quando a pessoa assiste **85% do vídeo aqui** (pulos para frente não contam) ou chega ao fim. Também dá para marcar ou desmarcar à mão.
- A posição do vídeo é salva a cada 15 s, então "Continuar" retoma de onde a pessoa parou, em qualquer aparelho.
- O progresso fica no Firestore, em `users/{uid}`, e as regras garantem que cada pessoa só lê e escreve o próprio documento.
- As perguntas foram escritas a partir do tema de cada aula (não há transcrição dos vídeos). Vale revisá-las; ficam em `public/data/quiz.json`.

Sem configurar nada, o site abre em **modo demonstração** (sem login, progresso só no navegador). Bom para testar.

## Testar no seu computador

```bash
cd public
python3 -m http.server 8000
# abra http://localhost:8000
```

## Ativar o login com Google (≈15 minutos, gratuito)

1. Acesse https://console.firebase.google.com e clique em **Adicionar projeto** (pode desativar o Google Analytics).
2. **Authentication > Começar > Método de login > Google > Ativar**. Escolha o e-mail de suporte e salve.
3. **Firestore Database > Criar banco de dados**. Escolha a região `southamerica-east1` (São Paulo) e o modo de produção.
4. **Configurações do projeto (engrenagem) > Seus apps > ícone `</>` (Web)**. Registre o app e copie o objeto `firebaseConfig`.
5. Cole os valores em `public/firebase-config.js`.
6. Publique as regras e o site com a Firebase CLI (precisa do Node.js):

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add          # escolha o projeto criado
   firebase deploy             # publica o site (Hosting) e as regras do Firestore
   ```

   O endereço final aparece no terminal, algo como `https://seu-projeto.web.app`.

7. Se for hospedar em outro domínio (ex.: Vercel, Netlify ou domínio próprio), adicione-o em **Authentication > Configurações > Domínios autorizados**. `localhost` já vem autorizado para testes.

## Estrutura

```
public/
  index.html            página
  styles.css            visual
  app.js                telas, player do YouTube, perguntas
  store.js              login Google + Firestore (ou localStorage no modo demonstração)
  firebase-config.js    sua configuração do Firebase
  data/courses.json     cursos > matérias > aulas (ID do vídeo, título, duração, professor)
  data/quiz.json        perguntas por ID do vídeo
firestore.rules         regras de acesso ao banco
firebase.json           configuração do Firebase Hosting
tools/merge_data.py     script usado para montar data/ (pode ignorar)
```

## Editar conteúdo

- **Perguntas:** em `data/quiz.json`, cada ID de vídeo tem uma lista de `{ "q": pergunta, "o": [4 alternativas], "a": índice da correta (0–3), "e": explicação }`.
- **Aulas novas:** acrescente em `data/courses.json` dentro da matéria certa, com `id` (o código depois de `v=` no link do YouTube), `title`, `dur` e `teacher`.

## Ver o progresso das pessoas

No Console do Firebase, **Firestore > users**: cada documento tem `watched` (aulas assistidas com data), `quiz` (acertos por aula), `pos` e `sec` (posição e tempo assistido) e `last` (última aula aberta).
