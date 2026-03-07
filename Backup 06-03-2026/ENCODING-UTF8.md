# 🔤 Melhorias de Codificação UTF-8

## 📋 Problema Resolvido

Cartas com caracteres especiais, acentos e emojis estavam sendo corrompidas durante:
- Leitura de arquivos JSON
- Envio via HTTP/fetch
- Armazenamento no banco de dados
- Retorno das APIs

## ✅ Soluções Implementadas

### 1. **Script PowerShell** (`publicar-personagens-producao.ps1`)
```powershell
# Leitura UTF-8 sem BOM
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$jsonBytes = [System.IO.File]::ReadAllBytes($Arquivo)
$jsonText = $utf8NoBom.GetString($jsonBytes)

# Escrita UTF-8 sem BOM
[System.IO.File]::WriteAllText($tmpPayload, $payloadJson, $utf8NoBomWrite)
```

### 2. **Frontend HTML** (todos os arquivos .html)
```javascript
// Antes
headers: { 'Content-Type': 'application/json' }

// Depois
headers: { 'Content-Type': 'application/json; charset=utf-8' }
```

### 3. **Backend Worker** (`worker.js`)
```javascript
// Função melhorada de normalização
const normalizarTexto = (valor) => {
  if (valor == null) return '';
  let texto = String(valor).trim();
  // Remove apenas caracteres de controle, mantém UTF-8 válido
  texto = texto.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return texto;
};

// Headers explícitos
headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders }
```

## 📁 Arquivos Modificados

- ✅ `publicar-personagens-producao.ps1`
- ✅ `popular-cartas.html`
- ✅ `solo.html`
- ✅ `recompensas.html`
- ✅ `admin.html`
- ✅ `worker.js`

## 🎯 Resultado Esperado

- ✅ Acentos preservados: `João`, `María`, `José`
- ✅ Emojis funcionando: `🎯`, `📖`, `⚔️`
- ✅ Caracteres especiais: `ã`, `õ`, `ç`, `é`, `ê`
- ✅ Aspas e pontuação: `"`, `'`, `—`, `…`

## 🔍 Como Testar

1. Adicionar carta com acentos via `popular-cartas.html`
2. Verificar no jogo se os caracteres aparecem corretamente
3. Confirmar no banco de dados via admin

## 📚 Referências

- UTF-8 sem BOM: Evita problemas de compatibilidade
- Charset explícito: Garante interpretação correta
- Normalização cuidadosa: Remove apenas controle, preserva conteúdo
