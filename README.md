# tiny stack VM

An exact interpreter for make.fun's tiny stack ISA (see the competition kit's
`generator/subject/ISA.md`), written for the tiny-stack-vm-01 bounty. It answers
every instance of a set in one run: for each `/input/<id>/` it writes
`/output/<id>/stdout.bin` and `/output/<id>/exit.txt`.

Run it locally on the kit's practice set:

    mkdir -p out && MAKEFUN_INPUT_DIR=<kit>/practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
