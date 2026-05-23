# Reginaldo Imóveis — Site Oficial

> Curadoria de imóveis de alto padrão em São Paulo. Atendimento personalizado, do primeiro contato à chave na mão. **CRECI 17407-J**

🌐 **[www.reginaldoimoveisltda.com.br](https://www.reginaldoimoveisltda.com.br)**

---

## ✨ Sobre o projeto

Site institucional e vitrine de imóveis da **Reginaldo Imóveis**, imobiliária com mais de 28 anos de mercado em São Paulo. O site foi desenvolvido com foco em performance, experiência mobile-first e geração de leads qualificados.

### Principais funcionalidades

- 🏠 **Vitrine de imóveis** — cards com galeria de fotos, características e preço, carregados em tempo real do Firestore
- 🔍 **Busca e filtros** — por tipo de imóvel, finalidade (venda/aluguel), faixa de preço e palavra-chave
- 📱 **Compartilhamento WhatsApp** — preview rico com foto e preço do imóvel via Cloud Function (OG proxy)
- 📋 **Formulário de captação** — perfil do comprador enviado ao Firestore com classificação automática High Ticket (≥ R$ 1,5M)
- ❤️ **Favoritos offline** — salvo em localStorage com cache de imagens via Service Worker
- 💬 **Formulário de contato** — leads salvos no Firestore com interesse categorizado
- 📊 **Simulador de financiamento** — cálculo estimado de parcelas com taxa de referência Caixa/Itaú
- 🗺️ **Mapa integrado** — localização do imóvel via Google Maps embed
- 🍪 **LGPD** — banner de consentimento de cookies em conformidade com a lei
- ⚡ **PWA** — Service Worker com cache inteligente (shell, assets e imagens de favoritos)

---

## 🛠️ Stack técnica

| Camada | Tecnologia |
|--------|------------|
| Frontend | HTML5 · CSS3 (custom properties, Grid, Flexbox) · JavaScript ES2022 (modules) |
| Banco de dados | Firebase Firestore |
| Hospedagem | GitHub Pages (frontend estático) |
| OG Proxy | Firebase Cloud Functions (Node.js 20) |
| CI/CD | GitHub Actions |
| PWA | Service Worker + Web App Manifest |
| SEO | Schema.org (RealEstateAgent · RealEstateListing · Product) |

---

## 📁 Estrutura do projeto

```
reginaldo-imoveis/
├── frontend/               # Site estático (publicado no GitHub Pages)
│   ├── index.html          # Home — vitrine, busca e captação
│   ├── detalhes.html       # Página de detalhes do imóvel (?id=...)
│   ├── contato.html        # Página de contato
│   ├── politica-de-privacidade.html
│   ├── css/
│   │   └── style.css       # Design system completo (mobile-first)
│   ├── js/
│   │   ├── main.js         # Lógica principal (Firestore, filtros, favoritos)
│   │   ├── firebase-config.js
│   │   └── tracker.js      # UTM e analytics
│   ├── img/                # Favicon, OG image e ícones PWA
│   ├── sw.js               # Service Worker
│   └── manifest.json       # PWA manifest
├── functions/              # Firebase Cloud Functions
│   └── index.js            # OG proxy — retorna meta tags para WhatsApp/Facebook
└── .github/
    └── workflows/
        └── deploy.yml      # CI/CD — publica Pages + Functions no push para main
```

---

## 🚀 Deploy

O deploy é **automático** a cada push para `main` via GitHub Actions:

1. **GitHub Pages** — publica a pasta `frontend/` no domínio customizado
2. **Firebase Functions** — faz deploy do OG proxy (requer secret `FIREBASE_TOKEN`)

### Deploy manual das Functions

```bash
# Instalar dependências
cd functions && npm install

# Autenticar
firebase login

# Deploy
firebase deploy --only functions
```

### Configurar CI/CD das Functions

Adicione o token de autenticação nos secrets do repositório:

```bash
# Gerar token
firebase login:ci
```

Em **Settings → Secrets → Actions**, crie o secret `FIREBASE_TOKEN` com o valor gerado.

---

## 🔗 URLs importantes

| Recurso | URL |
|---------|-----|
| Site | `https://www.reginaldoimoveisltda.com.br` |
| Detalhes de imóvel | `https://www.reginaldoimoveisltda.com.br/detalhes.html?id={ID}` |
| OG Proxy (WhatsApp) | `https://southamerica-east1-reginaldo-imoveis.cloudfunctions.net/imovel?id={ID}` |
| Firebase Console | `https://console.firebase.google.com/project/reginaldo-imoveis` |

---

## 📱 Compartilhamento WhatsApp

Quando um imóvel é compartilhado, o link aponta para a **Cloud Function** (OG proxy) que:

1. Busca o imóvel no Firestore
2. Retorna HTML estático com `<meta property="og:*">` corretos (foto, título, preço)
3. Redireciona automaticamente o usuário para a página real

Isso garante que o WhatsApp exiba a **foto e o preço corretos** do imóvel no preview da mensagem.

---

## 📞 Contato

**Reginaldo Imóveis**  
Av. Sapopemba, 3320 — Vila Regente Feijó, São Paulo/SP  
📱 [(11) 95328-0353](https://wa.me/5511953280353)  
📧 reginaldoimoveisltda@gmail.com  
🏢 CRECI 17407-J
