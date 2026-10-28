# Pixel art das criaturas

O jogo desenha as criaturas pixel a pixel a partir de `client/src/creatures/pixels.json`.

As imagens em `reference/` são só referência de forma e cor (recortadas da folha de arte);
o jogo não usa esses arquivos. Para gerar a pixel art de novo depois de trocar ou acrescentar
uma referência:

```bash
python3 tools/creatures/pixelize.py            # regrava pixels.json
python3 tools/creatures/pixelize.py previa.png # e salva uma prévia ampliada
```

Precisa de Python 3 com `pillow` e `numpy` (`pip install pillow numpy`).

Ajustes por criatura (tamanho da grade e número de cores) ficam em `TUNING`, no começo do script.
Para editar à mão, cada criatura no JSON tem `palette` (a letra `a` é o contorno, `b` em diante
são as cores) e `rows` (uma string por linha, `.` = transparente).
