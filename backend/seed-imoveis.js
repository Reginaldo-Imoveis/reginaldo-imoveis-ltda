/**
 * Seed: 10 imóveis fictícios para teste de carga
 * Execute: node backend/seed-imoveis.js
 */
const db = require('./db');

const imoveis = [
  {
    titulo: 'Cobertura Duplex Jardins',
    tipo: 'Cobertura',
    preco: 4200000,
    descricao: 'Cobertura duplex de alto padrão no coração dos Jardins. 360m² com terraço privativo, piscina aquecida, sala de home theater e cozinha gourmet com ilha central. Acabamentos importados, automação completa e vista panorâmica da cidade. Condomínio com segurança 24h, concierge e academia.',
    quartos: 4, vagas: 4, suites: 4, areaUtil: 360, areaTotal: 420,
    imagem: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&auto=format',
    finalidade: 'Venda', status: 'Disponível', destaque: 1,
  },
  {
    titulo: 'Casa Alto Padrão Morumbi',
    tipo: 'Casa',
    preco: 3800000,
    descricao: 'Casa de luxo no Morumbi com 480m² de área construída em terreno de 1.200m². Sala de estar com pé-direito duplo, 5 suítes com closet, piscina adulto e infantil, churrasqueira coberta e jardim exuberante. Segurança perimetral e câmeras. Ideal para famílias que buscam conforto e privacidade.',
    quartos: 5, vagas: 5, suites: 5, areaUtil: 480, areaTotal: 1200,
    imagem: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&auto=format',
    finalidade: 'Venda', status: 'Disponível', destaque: 1,
  },
  {
    titulo: 'Apartamento Itaim Bibi',
    tipo: 'Apartamento',
    preco: 1850000,
    descricao: 'Apartamento moderno de 142m² no Itaim Bibi, a dois passos das melhores opções de lazer e gastronomia da cidade. Sala integrada com varanda gourmet, 3 suítes sendo a master com closet e banheiro com banheira. Acabamento de altíssimo nível, 2 vagas e depósito.',
    quartos: 3, vagas: 2, suites: 3, areaUtil: 142, areaTotal: 162,
    imagem: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&auto=format',
    finalidade: 'Venda', status: 'Disponível', destaque: 1,
  },
  {
    titulo: 'Flat Studio Vila Olímpia',
    tipo: 'Apartamento',
    preco: 4800,
    descricao: 'Studio moderno e funcional de 38m² para locação na Vila Olímpia. Mobiliado com design contemporâneo, cozinha compacta americana, banheiro com box de vidro e varanda. Prédio com portaria 24h, academia e lavanderia. Ideal para profissionais e executivos.',
    quartos: 1, vagas: 1, suites: 1, areaUtil: 38, areaTotal: 42,
    imagem: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&auto=format',
    finalidade: 'Locação', status: 'Disponível', destaque: 0,
  },
  {
    titulo: 'Sobrado Condomínio Vila Andrade',
    tipo: 'Sobrado',
    preco: 1480000,
    descricao: 'Sobrado em condomínio fechado na Vila Andrade com 3 dormitórios sendo 2 suítes, sala de estar e jantar integradas, lavabo, área gourmet com churrasqueira e 2 vagas. Condomínio com segurança 24h, piscina coletiva, quadra poliesportiva e playground. Ótima localização, próximo a escolas e shoppings.',
    quartos: 3, vagas: 2, suites: 2, areaUtil: 180, areaTotal: 220,
    imagem: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=1200&auto=format',
    finalidade: 'Venda', status: 'Disponível', destaque: 0,
  },
  {
    titulo: 'Penthouse Pinheiros',
    tipo: 'Cobertura',
    preco: 5900000,
    descricao: 'Penthouse exclusiva no bairro Pinheiros com 520m² distribuídos em dois andares. Terraço com piscina privativa aquecida e spa, sala de jantar para 20 pessoas, adega climatizada, 4 suítes com closet, home office estruturado e sistema de automação inteligente Crestron. Um estilo de vida sem igual.',
    quartos: 4, vagas: 5, suites: 4, areaUtil: 520, areaTotal: 620,
    imagem: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&auto=format',
    finalidade: 'Venda', status: 'Disponível', destaque: 1,
  },
  {
    titulo: 'Loft Industrial Barra Funda',
    tipo: 'Apartamento',
    preco: 980000,
    descricao: 'Loft de 95m² com estilo industrial sofisticado na Barra Funda. Pé-direito de 4 metros com vigas aparentes, piso de cimento queimado, cozinha integrada com ilha de granito e mezanino com escritório. Perfeito para quem busca um estilo de vida urbano e autêntico. Próximo à linha 2 do metrô.',
    quartos: 1, vagas: 1, suites: 1, areaUtil: 95, areaTotal: 95,
    imagem: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200&auto=format',
    finalidade: 'Venda', status: 'Disponível', destaque: 0,
  },
  {
    titulo: 'Casa de Campo Cotia',
    tipo: 'Casa',
    preco: 2100000,
    descricao: 'Casa de campo sofisticada em condomínio de alto padrão em Cotia, a 30 minutos de SP. Terreno de 2.500m² com casa principal de 380m², 4 suítes, sala de jogos, piscina com cascata, quadra de tênis e espaço gourmet. Tranquilidade e contato com a natureza sem abrir mão do conforto.',
    quartos: 4, vagas: 4, suites: 4, areaUtil: 380, areaTotal: 2500,
    imagem: 'https://images.unsplash.com/photo-1480074568708-e7b720bb3f09?w=1200&auto=format',
    finalidade: 'Venda', status: 'Reservado', destaque: 0,
  },
  {
    titulo: 'Conjunto Comercial Faria Lima',
    tipo: 'Comercial',
    preco: 18000,
    descricao: 'Conjunto comercial premium na Avenida Faria Lima — o coração financeiro de São Paulo. 220m² em andar alto com vista privilegiada, 2 banheiros, copa, 3 vagas, salas moduláveis e acabamento corporativo de alto nível. Prédio triple A com certificação LEED, restaurante, heliponto e geradora própria.',
    quartos: 0, vagas: 3, suites: 0, areaUtil: 220, areaTotal: 240,
    imagem: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&auto=format',
    finalidade: 'Locação', status: 'Disponível', destaque: 0,
  },
  {
    titulo: 'Mansão Granja Viana',
    tipo: 'Casa',
    preco: 9500000,
    descricao: 'Mansão exclusiva na Granja Viana com 800m² de área construída em terreno de 5.000m². 6 suítes com closet, piscina olímpica, campo de golfe privativo, cinema, SPA completo com sauna e ofurô, garagem para 10 carros e casa de caseiro. Segurança total perimetral. Uma propriedade única no mercado paulistano.',
    quartos: 6, vagas: 10, suites: 6, areaUtil: 800, areaTotal: 5000,
    imagem: 'https://images.unsplash.com/photo-1613977257363-707ba9348227?w=1200&auto=format',
    finalidade: 'Venda', status: 'Disponível', destaque: 1,
  },
];

function slugify(str) {
  return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const stmt = db.prepare(`
  INSERT INTO imoveis (titulo, tipo, preco, descricao, quartos, vagas, suites, areaUtil, areaTotal, imagem, finalidade, status, destaque, galeria, slug)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let count = 0;
imoveis.forEach(im => {
  stmt.run(
    im.titulo, im.tipo, im.preco, im.descricao,
    im.quartos, im.vagas, im.suites, im.areaUtil, im.areaTotal,
    im.imagem, im.finalidade, im.status, im.destaque ? 1 : 0,
    '[]', slugify(im.titulo),
    (err) => {
      if (err) console.error('Erro ao inserir:', im.titulo, err.message);
      else console.log(`✓ Inserido: ${im.titulo}`);
      count++;
      if (count === imoveis.length) {
        stmt.finalize(() => {
          console.log('\n✅ Seed concluído! 10 imóveis adicionados.');
          db.close();
        });
      }
    }
  );
});
