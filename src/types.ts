export type StandStatus = 'disponivel' | 'reservado' | 'vendido' | 'indisponivel';
export type ReservaStatus = 'ativa' | 'confirmada' | 'expirada' | 'cancelada';
export type Role = 'master' | 'vendedor';

export interface Categoria {
  id: number;
  nome: string;
  preco: number | null;
  tamanho: string | null;
  descricao: string | null;
  beneficios: string | null;
  ordem: number;
  total_stands: number;
  disponiveis: number;
}

export interface Stand {
  id: number;
  codigo: string;
  nome: string;
  descricao: string | null;
  imagem_url: string | null;
  status: StandStatus;
  ordem: number;
  // Cota vinculada
  categoria_id: number | null;
  categoria: string | null;
  categoria_descricao: string | null;
  categoria_beneficios: string | null;
  // Valores efetivos (do stand quando preenchidos, senão da cota)
  preco: number | null;
  tamanho: string | null;
  preco_proprio: number | null;
  tamanho_proprio: string | null;
  // Reserva vigente
  reserva_id: number | null;
  reserva_status: ReservaStatus | null;
  reserva_vendedor_id: number | null;
  reserva_vendedor_nome: string | null;
  reserva_cliente_nome: string | null;
  reserva_cliente_empresa: string | null;
  reserva_expira_em: string | null;
}

/* Dados que alimentam o contrato de patrocínio */
export interface DadosContrato {
  razao_social: string;
  cnpj: string;
  endereco: string;
  cep: string;
  cidade: string;
  estado: string;
  representante_nome: string;
  representante_cpf: string;
  representante_cargo: string;
  forma_pagamento: string;
  valor_negociado: string;
}

export interface Reserva extends Partial<DadosContrato> {
  id: number;
  stand_id: number;
  vendedor_id: number;
  cliente_nome: string;
  cliente_empresa: string | null;
  cliente_contato: string | null;
  cliente_email: string | null;
  observacoes: string | null;
  status: ReservaStatus;
  criada_em: string;
  expira_em: string;
  confirmada_em: string | null;
  contrato_arquivo: string | null;
  contrato_gerado_em: string | null;
  stand_codigo: string;
  stand_nome: string;
  stand_preco: number | null;
  vendedor_nome: string;
}

export interface Anexo {
  id: number;
  nome_original: string;
  mime: string | null;
  tamanho: number | null;
  enviado_em: string;
  enviado_por_nome: string | null;
}

export interface Usuario {
  id: number;
  username: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  role: Role;
  ativo: number;
  created_at: string;
}

export interface ConfigSistema {
  reserva_horas: number;
  notif_emails: string;
  notif_whatsapps: string;
  canais: { email: boolean; whatsapp: boolean; whatsapp_provider: string | null };
}

export interface LogNotificacao {
  id: number;
  reserva_id: number | null;
  canal: 'email' | 'whatsapp';
  destino: string;
  status: 'enviado' | 'falha';
  erro: string | null;
  enviado_em: string;
  stand_codigo: string | null;
}

export interface Sessao {
  token: string;
  id: number;
  username: string;
  nome: string;
  role: Role;
}
