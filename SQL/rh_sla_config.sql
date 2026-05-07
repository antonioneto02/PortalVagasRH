-- Executar no banco: portal_rh
USE portal_rh;
GO

CREATE TABLE RH_SLA_CONFIG (
  ID            INT IDENTITY(1,1) PRIMARY KEY,
  FUNCAO        VARCHAR(200) NOT NULL,
  SLA_DIAS      INT          NOT NULL,
  CLASSIFICACAO VARCHAR(20)  NOT NULL,
  DTINCLUSAO    DATETIME     DEFAULT GETDATE()
);
GO

INSERT INTO RH_SLA_CONFIG (FUNCAO, SLA_DIAS, CLASSIFICACAO) VALUES
('AJUDANTE DE PRODUCAO',             5,  'BAIXA'),
('ALMOXARIFE',                        5,  'BAIXA'),
('ANALISTA ADM - JR',                10,  'MEDIA'),
('ANALISTA DE DADOS PLENO',          10,  'MEDIA'),
('ANALISTA DE GESTAO DE ESTOQUE',    10,  'MEDIA'),
('ANALISTA DE GESTAO DE ESTOQUE PLENO', 10, 'MEDIA'),
('ANALISTA DE QUALIDADE',            10,  'MEDIA'),
('ANALISTA FINANCEIRO PLENO',        10,  'MEDIA'),
('ASSISTENTE COMERCIAL',             10,  'MEDIA'),
('ASSISTENTE DE MARKETING',          10,  'MEDIA'),
('ASSISTENTE DE TI',                 10,  'MEDIA'),
('AUXILIAR ADMINISTRATIVO',           5,  'BAIXA'),
('AUXILIAR DE ESTOQUE',               5,  'BAIXA'),
('CONFERENTE I',                      5,  'BAIXA'),
('DIRETOR',                          15,  'ALTA'),
('DIRETOR ADMINISTRATIVO',           15,  'ALTA'),
('ELETROTECNICO',                    10,  'MEDIA'),
('ENCARREGADO ALMOXARIFADO',         10,  'MEDIA'),
('ESTAGIARIO (A) RH',                 5,  'BAIXA'),
('ESTOQUISTA',                        5,  'BAIXA'),
('GERENTE DE PRODUCAO',              15,  'ALTA'),
('GERENTE DE VENDAS',                15,  'ALTA'),
('MOTORISTA TRUCK',                   5,  'BAIXA'),
('SUPERVISOR DE CONTROLADORIA',      15,  'ALTA'),
('TEC. EM SEGURANCA DO TRABALHO',    10,  'MEDIA'),
('TECNICO AUX EM INFORMATICA',       10,  'MEDIA'),
('XAROPEIRO',                         5,  'BAIXA'),
('AUXILIAR DE RECURSOS HUMANOS',      5,  'BAIXA'),
('OPERADOR DE TELEVENDAS',            5,  'BAIXA'),
('ASSISTENTE DE LOGISTICA',          10,  'MEDIA'),
('ANALISTA FINANCEIRO',              10,  'MEDIA'),
('ANALISTA DE MARKETING',            10,  'MEDIA'),
('ANALISTA DE RECURSOS HUMANOS',     10,  'MEDIA'),
('SUPERVISOR DE LOGISTICA',          15,  'ALTA'),
('SUPERVISOR DE PRODUCAO PLENO',     15,  'ALTA'),
('CONTROLLER',                       15,  'ALTA'),
('SUPERVISOR DE RECURSOS HUMANOS',   15,  'ALTA'),
('VENDEDOR',                          5,  'BAIXA'),
('GESTOR DE FROTA',                  15,  'ALTA'),
('SUPERVISOR DE MARKETING',          15,  'ALTA'),
('GERENTE DE VENDAS SENIOR',         15,  'ALTA'),
('SUPERVISOR DE VENDAS',             15,  'ALTA'),
('PROMOTOR DE VENDAS',                5,  'BAIXA'),
('OPERADOR DE MAQUINA',               5,  'BAIXA'),
('OPERADOR DE EMPILHADEIRA',          5,  'BAIXA'),
('RECEPCIONISTA',                     5,  'BAIXA');
GO
