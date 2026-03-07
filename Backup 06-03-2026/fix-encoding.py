#!/usr/bin/env python3
"""
Script para corrigir problemas de codificação UTF-8 no arquivo cartas-biblicas.json
Detecta e corrige caracteres duplicados como ãª, âª, êª, bãª, etc.
"""

import json
import sys
from pathlib import Path

def corrigir_dupla_codificacao(texto):
    """
    Corrige padrões de dupla codificação UTF-8.
    Exemplo: ãª -> ã, âª -> â, êª -> ê, bãª -> bã
    """
    if not texto:
        return texto
    
    # Mapeamento de caracteres corruptos para corretos
    # Ordem importa: palavras específicas primeiro, depois caracteres
    correcoes = {
        # Palavras inteiras corruptas
        'primogãªnito': 'primogênito',
        'primogãnito': 'primogênito',
        'primogãªnita': 'primogênita',
        'primogãnita': 'primogênita',
        'bãªnção': 'bênção',
        'bãnção': 'bênção',
        'bãªnçãªo': 'bênção',
        'vendãª-lo': 'vendê-lo',
        'vendã-lo': 'vendê-lo',
        'desobediãªncia': 'desobediência',
        'desobediãncia': 'desobediência',
        'descendãªncia': 'descendência',
        'descendãncia': 'descendência',
        'trãªs': 'três',
        'trãs': 'três',
        'Primogãªnito': 'Primogênito',
        'Primogãnito': 'Primogênito',
        'Primogãªnita': 'Primogênita',
        'Primogãnita': 'Primogênita',
        'Vendãª-lo': 'Vendê-lo',
        'Vendã-lo': 'Vendê-lo',
        'Bãªnção': 'Bênção',
        'Bãnção': 'Bênção',
        'Trãªs': 'Três',
        'Trãs': 'Três',
        # Caracteres individuais corruptos
        'ãª': 'ã',
        'âª': 'â',  
        'êª': 'ê',
        'ôª': 'ô',
        'õª': 'õ',
        'áª': 'á',
        'éª': 'é',
        'íª': 'í',
        'óª': 'ó',
        'úª': 'ú',
        'ãµ': 'ã',
        'âµ': 'â',
        'êµ': 'ê',
    }
    
    resultado = texto
    for errado, correto in correcoes.items():
        resultado = resultado.replace(errado, correto)
    
    return resultado

def processar_cartas(arquivo_entrada, arquivo_saida=None):
    """
    Processa o arquivo JSON e corrige caracteres truncados.
    """
    if arquivo_saida is None:
        arquivo_saida = arquivo_entrada.replace('.json', '-corrigido.json')
    
    print(f"📖 Lendo: {arquivo_entrada}")
    with open(arquivo_entrada, 'r', encoding='utf-8') as f:
        dados = json.load(f)
    
    cartas_corrigidas = 0
    caracteres_corrigidos = 0
    
    # Navegar pela estrutura de dados
    if 'personagens' in dados and len(dados['personagens']) > 0:
        cartas = dados['personagens'][0].get('value', [])
    else:
        print("❌ Estrutura JSON não reconhecida")
        return False
    
    print(f"📊 Total de cartas: {len(cartas)}")
    
    for i, carta in enumerate(cartas):
        carta_corrigida = False
        
        for campo in ['dica1', 'dica2', 'dica3', 'resposta']:
            if campo in carta and isinstance(carta[campo], str):
                original = carta[campo]
                corrigido = corrigir_dupla_codificacao(original)
                
                if original != corrigido:
                    carta[campo] = corrigido
                    caracteres_corrigidos += 1
                    carta_corrigida = True
                    print(f"  ✅ {carta.get('resposta', '?')} - {campo}: '{original}' -> '{corrigido}'")
        
        if carta_corrigida:
            cartas_corrigidas += 1
    
    # Salvar arquivo corrigido
    print(f"\n💾 Salvando em: {arquivo_saida}")
    with open(arquivo_saida, 'w', encoding='utf-8') as f:
        json.dump(dados, f, ensure_ascii=False, indent=4)
    
    print(f"\n✅ Resultado:")
    print(f"  • Cartas corrigidas: {cartas_corrigidas}")
    print(f"  • Campos corrigidos: {caracteres_corrigidos}")
    
    return True

if __name__ == '__main__':
    arquivo = 'cartas-biblicas.json'
    
    if not Path(arquivo).exists():
        print(f"❌ Arquivo não encontrado: {arquivo}")
        sys.exit(1)
    
    processar_cartas(arquivo)
