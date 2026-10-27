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

## Publicação e login

- **Site:** https://opedrosobrinhos.github.io/teo-study/ — publicado pelo GitHub Pages a cada push na `main` (`.github/workflows/pages.yml` envia a pasta `public/`).
- **Firebase:** projeto `estudos-de-teologia` (plano gratuito). Login com Google ativado, Firestore em `southamerica-east1` (São Paulo), regras de `firestore.rules` publicadas pelo console.
- **Domínios autorizados** (Authentication > Configurações): `localhost`, `opedrosobrinhos.github.io` e os domínios padrão do Firebase. Se o site for para outro domínio, adicione-o lá.
- Se mudar `firestore.rules`, cole o conteúdo em **Firestore > Regras** e publique (ou use `firebase deploy --only firestore:rules`).

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
