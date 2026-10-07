# C7 Agendamento

Aplicação pública de agendamento e futura área do cliente da C7 Barbearia Tradicional.

## Responsabilidade deste repositório

- identificação/cadastro do cliente;
- seleção de serviços;
- escolha de profissional;
- disponibilidade e horários;
- confirmação do agendamento;
- futura área autenticada do cliente.

O sistema interno permanece separado no repositório `7-system`.

## Backend

O projeto usa o mesmo Supabase da operação C7, com RPCs públicas específicas para o fluxo de agendamento. O frontend público não recebe permissão de leitura direta sobre a base completa de clientes ou agendamentos.
