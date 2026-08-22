Atualização de produção — Aula Clara
# Fontes persistentes de materiais

Antes de usar **Adicionar material / fonte**, aplique o arquivo
`supabase/schema_material_sources.sql` no SQL Editor do mesmo projeto Supabase usado pelo login.
Ele cria as tabelas de fontes, páginas e chunks, o bucket privado e as políticas RLS por professor.

O fluxo separa armazenamento, conferência e leitura. As páginas são processadas individualmente
e o texto salvo pode ser enviado aos geradores sem reenviar as imagens.
