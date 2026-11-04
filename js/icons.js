/* Ícones de linha (24x24, traço currentColor). Constantes próprias — seguro usar innerHTML. */
(function (g) {
  'use strict';
  var PS = g.PS = g.PS || {};
  var P = {
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    nuvem: '<path d="M7 18a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 9.5a4.2 4.2 0 0 1 .5 8.5z"/>',
    chuva: '<path d="M7 15a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 6.5a4.2 4.2 0 0 1 .5 8.5z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
    tempestade: '<path d="M7 15a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 6.5a4.2 4.2 0 0 1 .5 8.5z"/><path d="M12 14l-2 4h4l-2 4"/>',
    neblina: '<path d="M4 8h16M3 12h18M5 16h14M8 20h8"/>',
    neve: '<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/>',
    agua: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
    treino: '<path d="M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12"/>',
    remedio: '<path d="M10.5 20.5a4.95 4.95 0 0 1-7-7l10-10a4.95 4.95 0 0 1 7 7z"/><path d="M8.5 8.5l7 7"/>',
    livro: '<path d="M3 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H3z"/><path d="M21 5h-7a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h7z"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    casa: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    lista: '<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    play: '<path d="M8 5l11 7-11 7z"/>',
    ajustes: '<path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10M20 18h0"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    familia: '<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/><path d="M17 3.1a4 4 0 0 1 0 7.8M22 21v-2a4 4 0 0 0-3-3.9"/>',
    carteira: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/>',
    sino: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/>',
    tv: '<rect x="3" y="4" width="18" height="13" rx="2.5"/><path d="M12 17v3M8 20h8"/>',
    jogo: '<rect x="2" y="7" width="20" height="11" rx="5.5"/><path d="M7 12h4M9 10v4M16 11h.01M18 13h.01"/>',
    filme: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4"/>',
    globo: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    musica: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    lapis: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    microfone: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
    estrela: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    alerta: '<path d="M12 4l9.5 16.5h-19z"/><path d="M12 10v4M12 17h.01"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    chama: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>',
    alvo: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    pin: '<path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    seta: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    teclado: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    'casa-de-cachorro': '<path d="M1.8 12.2L12 3.4l10.2 8.8"/><path d="M4.6 10.4V20.6h14.8V10.4"/><path d="M8.8 20.6v-6.2a3.2 3.2 0 0 1 6.4 0v6.2"/><path d="M1.8 20.6h20.4"/><path d="M10.4 8.2h3.2"/>',
    pata: '<circle cx="6.3" cy="10.2" r="1.7"/><circle cx="9.9" cy="6.2" r="1.7"/><circle cx="14.1" cy="6.2" r="1.7"/><circle cx="17.7" cy="10.2" r="1.7"/><path d="M12 12.2c-3 0-5 2.8-5 5 0 1.8 1.5 2.4 3 1.9 1-.3 1.4-.5 2-.5s1 .2 2 .5c1.5.5 3-.1 3-1.9 0-2.2-2-5-5-5z"/>',
    escola: '<path d="M2.5 9.5L12 5l9.5 4.5L12 14z"/><path d="M6.5 12v4.5c0 1.2 2.5 2.5 5.5 2.5s5.5-1.3 5.5-2.5V12"/><path d="M21.5 9.5V15"/>',
    luz: '<path d="M13 3L5.5 13.5H11L10 21l8-10.5h-5.5z"/>',
    internet: '<path d="M2.5 9.2a14 14 0 0 1 19 0"/><path d="M5.5 12.6a9.5 9.5 0 0 1 13 0"/><path d="M8.7 16a5 5 0 0 1 6.6 0"/><path d="M12 19.5h.01"/>',
    mercado: '<path d="M3 4h2.4l2.2 11h10.2l2-8H6.6"/><path d="M9.5 20h.01M17 20h.01"/>',
    cartao: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/>',
    grafico: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    subiu: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    caiu: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    igual: '<path d="M5 9h14M5 15h14"/>',
    desfazer: '<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 0 12"/>',
    baixar: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    enviar: '<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>',
    radio: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M7 8l10-5M8 14h.01M8 17h5M16 14h2"/>',
    volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>',
    pausa: '<path d="M8 5v14M16 5v14"/>',
    cadeado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    arvore: '<path d="M12 21v-6"/><path d="M12 15a5 5 0 0 0 4-8 4 4 0 0 0-8 0 5 5 0 0 0 4 8z"/>',
    guarda: '<path d="M6 3h12v18l-6-4-6 4z"/>',
    busca: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    garfo: '<path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8a2 2 0 0 1-2 2M9 3v6M17 21V3c-2 1-3.5 4-3.5 8H17"/>',
    carro: '<path d="M5 16l1.5-5.5A2 2 0 0 1 8.4 9h7.2a2 2 0 0 1 1.9 1.5L19 16"/><rect x="3" y="16" width="18" height="4" rx="1.5"/><path d="M7 18h.01M17 18h.01"/>',
    coracao: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.600-7 10-7 10z"/>',
    sacola: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    aviao: '<path d="M3 12l18-8-5 17-4-7z"/><path d="M12 14l9-10"/>',
    repetir: '<path d="M17 3l3 3-3 3"/><path d="M4 11V9a3 3 0 0 1 3-3h13"/><path d="M7 21l-3-3 3-3"/><path d="M20 13v2a3 3 0 0 1-3 3H4"/>',
    pontos: '<path d="M6 12h.01M12 12h.01M18 12h.01"/>',
    parcelas: '<rect x="3" y="5" width="14" height="10" rx="2"/><path d="M7 19h12a2 2 0 0 0 2-2V9"/>',
    gas: '<path d="M12 3s5 4.500 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 .3 1.500 1 2 2 2 0-3-1-5 1-7z"/>',
    pago: '<circle cx="12" cy="12" r="9"/><path d="M8 12.500l3 3 5-6"/>',
    meta: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r=".8"/>',
    csv: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>'
  };
  PS.iconesLista = Object.keys(P);
  /* ícones oferecidos para contas (rótulos em PT-BR) */
  PS.iconesFamilia = [['', 'Nenhum'], ['casa-de-cachorro', 'Casinha de cachorro'], ['pata', 'Pet (patinha)'], ['escola', 'Escola'], ['carteira', 'Conta / carteira'], ['luz', 'Luz'], ['agua', 'Água'], ['gas', 'Gás'], ['cartao', 'Cartão'], ['carro', 'Carro / transporte'], ['sacola', 'Compras'], ['aviao', 'Viagem'], ['repetir', 'Assinatura'], ['internet', 'Internet'], ['mercado', 'Mercado'], ['casa', 'Casa'], ['remedio', 'Saúde'], ['livro', 'Livro'], ['sino', 'Aviso'], ['familia', 'Família'], ['estrela', 'Estrela']];
  PS.iconeFamiliaOk = function (n) { return PS.iconesFamilia.some(function (x) { return x[0] === n; }); };
  PS.icone = function (nome, cls) {
    var s = document.createElement('span');
    s.className = 'ic' + (cls ? ' ' + cls : '');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<svg viewBox="0 0 24 24" focusable="false">' + (P[nome] || P.estrela) + '</svg>';
    return s;
  };
})(window);
