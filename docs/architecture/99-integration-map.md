# Integration map

[← Index](00-index.md) · [Interactive navigator](navigator.html)

Each box is a module. A line means one module passes data to another; arrows point the way the data flows (from the module that produces it to the module that uses it).

## Diagram

```mermaid
flowchart LR
  subgraph G0["Core platform"]
    M01["01 App shell & navigation"]
    M02["02 Project data & storage"]
    M03["03 Parameters & design rules"]
    M32["32 Component database & library"]
    M34["34 Desktop wrapper (Electron)"]
    M31["31 Headless CLI & MCP"]
  end
  subgraph G1["Design inputs"]
    M04["04 Building & load assessment"]
    M05["05 Space planning & substation"]
    M06["06 Network / SLD editor & core calc"]
    M07["07 Load schedule & panels"]
  end
  subgraph G2["Studies"]
    M08["08 Voltage drop"]
    M09["09 Earthing & earth fault loop"]
    M10["10 Protection coordination"]
    M11["11 Breaker & cable selection"]
    M12["12 Transformer & generator"]
    M13["13 Power factor correction"]
    M14["14 Busbar & busway"]
    M15["15 UPS & solar PV"]
    M16["16 Load flow engines"]
    M33["33 Quick calcs & existing checks"]
  end
  subgraph G3["Equipment & containment"]
    M17["17 Enclosure & Form 4"]
    M18["18 Lighting & emergency lighting"]
    M19["19 Cable schedule, tray & containment"]
    M20["20 Equipment, BOQ & pricing"]
    M29["29 ELV systems"]
  end
  subgraph G4["CAD & drawings"]
    M21["21 Design CAD core"]
    M22["22 CAD electrical (devices on plans)"]
    M23["23 CAD sheets, plot & title block"]
    M24["24 Drawings, SLD sheets & register"]
  end
  subgraph G5["Documents & workflow"]
    M25["25 Reports & exports"]
    M26["26 Revisions & changes"]
    M27["27 Review, submissions & authority rules"]
    M28["28 Dashboard & readiness"]
    M30["30 Data exchange & inbox"]
  end
  M01 --> M02
  M03 --> M01
  M01 --> M04
  M01 --> M05
  M01 --> M06
  M01 --> M07
  M01 --> M08
  M01 --> M09
  M01 --> M10
  M01 --> M11
  M01 --> M13
  M01 --> M14
  M01 --> M15
  M01 --> M16
  M01 --> M17
  M01 --> M19
  M01 --> M21
  M01 --> M25
  M01 --> M26
  M01 --> M27
  M01 --> M28
  M29 --> M01
  M01 --> M31
  M32 --> M01
  M01 --> M33
  M34 --> M01
  M02 --> M03
  M02 --> M06
  M07 --> M02
  M02 --> M09
  M19 --> M02
  M23 --> M02
  M02 --> M28
  M02 --> M25
  M02 --> M31
  M02 --> M20
  M02 --> M32
  M27 --> M03
  M03 --> M06
  M03 --> M07
  M03 --> M12
  M03 --> M16
  M03 --> M24
  M03 --> M23
  M03 --> M26
  M03 --> M28
  M03 --> M31
  M32 --> M34
  M32 --> M11
  M32 --> M08
  M32 --> M09
  M32 --> M13
  M32 --> M18
  M32 --> M20
  M32 --> M22
  M32 --> M03
  M32 --> M17
  M32 --> M16
  M32 --> M25
  M34 --> M02
  M34 --> M25
  M24 --> M34
  M34 --> M23
  M34 --> M21
  M34 --> M16
  M34 --> M28
  M34 --> M31
  M08 --> M31
  M10 --> M31
  M11 --> M31
  M12 --> M31
  M19 --> M31
  M20 --> M31
  M21 --> M31
  M31 --> M22
  M25 --> M31
  M31 --> M26
  M31 --> M29
  M31 --> M30
  M33 --> M31
  M31 --> M04
  M32 --> M04
  M03 --> M04
  M06 --> M04
  M04 --> M07
  M04 --> M11
  M04 --> M05
  M04 --> M14
  M04 --> M24
  M22 --> M04
  M04 --> M25
  M04 --> M28
  M04 --> M02
  M06 --> M05
  M05 --> M11
  M05 --> M25
  M05 --> M26
  M05 --> M02
  M05 --> M34
  M06 --> M07
  M06 --> M08
  M06 --> M10
  M06 --> M14
  M06 --> M15
  M19 --> M06
  M06 --> M24
  M06 --> M25
  M06 --> M26
  M06 --> M27
  M06 --> M28
  M06 --> M30
  M06 --> M31
  M06 --> M33
  M06 --> M17
  M11 --> M07
  M07 --> M09
  M07 --> M20
  M07 --> M17
  M07 --> M14
  M07 --> M24
  M07 --> M23
  M07 --> M25
  M07 --> M31
  M32 --> M07
  M13 --> M07
  M33 --> M07
  M07 --> M08
  M03 --> M08
  M08 --> M11
  M13 --> M08
  M14 --> M08
  M08 --> M16
  M08 --> M19
  M08 --> M25
  M08 --> M02
  M08 --> M26
  M06 --> M09
  M11 --> M09
  M12 --> M09
  M04 --> M09
  M09 --> M25
  M09 --> M24
  M09 --> M23
  M09 --> M10
  M09 --> M28
  M09 --> M31
  M09 --> M26
  M09 --> M33
  M02 --> M10
  M10 --> M25
  M10 --> M28
  M10 --> M26
  M10 --> M27
  M11 --> M02
  M03 --> M11
  M19 --> M11
  M11 --> M06
  M11 --> M13
  M11 --> M22
  M11 --> M29
  M11 --> M15
  M11 --> M25
  M11 --> M24
  M11 --> M28
  M11 --> M16
  M11 --> M20
  M11 --> M30
  M12 --> M06
  M07 --> M12
  M13 --> M12
  M12 --> M10
  M12 --> M11
  M12 --> M16
  M12 --> M20
  M12 --> M24
  M12 --> M25
  M33 --> M12
  M13 --> M06
  M03 --> M13
  M13 --> M25
  M13 --> M28
  M27 --> M13
  M13 --> M26
  M13 --> M02
  M03 --> M14
  M14 --> M25
  M14 --> M28
  M14 --> M26
  M12 --> M15
  M03 --> M15
  M15 --> M16
  M15 --> M20
  M15 --> M25
  M15 --> M28
  M15 --> M26
  M15 --> M31
  M06 --> M16
  M02 --> M16
  M07 --> M16
  M16 --> M25
  M16 --> M23
  M03 --> M33
  M33 --> M08
  M18 --> M33
  M33 --> M20
  M33 --> M25
  M32 --> M33
  M12 --> M17
  M09 --> M17
  M17 --> M02
  M17 --> M20
  M17 --> M03
  M17 --> M34
  M18 --> M22
  M04 --> M18
  M18 --> M20
  M18 --> M24
  M07 --> M19
  M22 --> M19
  M19 --> M20
  M19 --> M25
  M19 --> M24
  M19 --> M21
  M19 --> M23
  M32 --> M19
  M19 --> M26
  M06 --> M20
  M09 --> M20
  M13 --> M20
  M14 --> M20
  M20 --> M25
  M20 --> M26
  M20 --> M27
  M20 --> M28
  M04 --> M29
  M22 --> M29
  M29 --> M21
  M29 --> M30
  M29 --> M07
  M06 --> M29
  M29 --> M26
  M29 --> M20
  M23 --> M29
  M29 --> M34
  M21 --> M02
  M04 --> M21
  M21 --> M22
  M21 --> M23
  M21 --> M24
  M21 --> M26
  M06 --> M21
  M21 --> M32
  M06 --> M22
  M22 --> M08
  M22 --> M20
  M03 --> M22
  M22 --> M24
  M22 --> M23
  M22 --> M26
  M23 --> M24
  M24 --> M02
  M14 --> M24
  M24 --> M26
  M24 --> M27
  M24 --> M25
  M24 --> M28
  M24 --> M31
  M24 --> M01
  M03 --> M25
  M26 --> M25
  M25 --> M28
  M26 --> M02
  M07 --> M26
  M26 --> M27
  M26 --> M28
  M27 --> M12
  M15 --> M27
  M27 --> M25
  M27 --> M28
  M27 --> M32
  M27 --> M34
  M08 --> M28
  M05 --> M28
  M30 --> M04
  M30 --> M02
  M30 --> M26
  M09 --> M30
  M30 --> M01
  M27 --> M30
  linkStyle 0 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 1 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 2 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 3 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 4 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 5 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 6 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 7 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 8 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 9 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 10 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 11 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 12 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 13 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 14 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 15 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 16 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 17 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 18 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 19 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 20 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 21 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 22 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 23 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 24 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 25 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 26 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 27 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 28 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 29 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 30 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 31 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 32 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 33 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 34 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 35 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 36 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 37 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 38 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 39 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 40 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 41 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 42 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 43 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 44 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 45 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 46 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 47 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 48 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 49 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 50 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 51 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 52 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 53 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 54 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 55 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 56 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 57 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 58 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 59 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 60 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 61 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 62 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 63 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 64 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 65 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 66 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 67 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 68 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 69 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 70 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 71 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 72 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 73 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 74 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 75 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 76 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 77 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 78 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 79 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 80 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 81 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 82 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 83 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 84 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 85 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 86 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 87 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 88 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 89 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 90 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 91 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 92 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 93 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 94 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 95 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 96 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 97 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 98 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 99 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 100 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 101 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 102 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 103 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 104 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 105 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 106 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 107 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 108 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 109 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 110 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 111 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 112 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 113 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 114 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 115 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 116 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 117 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 118 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 119 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 120 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 121 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 122 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 123 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 124 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 125 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 126 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 127 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 128 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 129 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 130 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 131 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 132 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 133 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 134 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 135 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 136 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 137 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 138 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 139 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 140 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 141 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 142 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 143 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 144 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 145 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 146 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 147 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 148 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 149 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 150 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 151 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 152 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 153 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 154 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 155 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 156 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 157 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 158 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 159 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 160 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 161 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 162 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 163 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 164 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 165 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 166 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 167 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 168 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 169 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 170 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 171 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 172 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 173 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 174 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 175 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 176 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 177 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 178 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 179 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 180 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 181 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 182 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 183 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 184 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 185 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 186 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 187 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 188 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 189 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 190 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 191 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 192 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 193 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 194 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 195 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 196 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 197 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 198 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 199 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 200 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 201 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 202 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 203 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 204 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 205 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 206 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 207 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 208 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 209 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 210 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 211 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 212 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 213 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 214 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 215 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 216 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 217 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 218 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 219 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 220 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 221 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 222 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 223 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 224 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 225 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 226 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 227 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 228 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 229 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 230 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 231 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 232 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 233 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 234 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 235 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 236 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 237 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 238 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 239 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 240 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 241 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 242 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 243 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 244 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 245 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 246 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 247 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 248 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 249 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 250 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 251 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 252 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 253 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 254 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 255 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 256 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 257 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 258 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 259 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 260 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 261 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 262 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 263 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 264 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 265 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 266 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 267 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 268 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 269 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 270 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 271 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 272 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 273 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 274 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 275 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 276 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 277 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 278 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 279 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 280 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 281 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 282 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 283 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 284 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 285 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 286 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 287 stroke:#2e8b57,stroke-width:1.5px
  linkStyle 288 stroke:#2e8b57,stroke-width:1.5px
```

## Links between modules

| From | To | What passes | Where (file — function) |
|---|---|---|---|
| App shell & navigation | Project data & storage | open, save, recovery, conflict, unsaved flag, undo history | `src/App.tsx:loadIntoApp` |
| App shell & navigation | Project data & storage | data link | `src/App.tsx:saveProject` |
| Parameters & design rules | App shell & navigation | preferences, new-project defaults, design stage gate | `src/App.tsx:createProject` |
| App shell & navigation | Building & load assessment | routes Building, Load assessment; concept report button | `src/App.tsx:App` |
| App shell & navigation | Building & load assessment | brief scope decides which screens and findings count | `src/model/brief.ts:viewInScope` |
| App shell & navigation | Space planning & substation | routes Space plan, Substation area | `src/App.tsx:App` |
| App shell & navigation | Network / SLD editor & core calc | SLD workspace, panel tree, run results (runCalculations), board/feeder forms | `src/App.tsx:runNow` |
| App shell & navigation | Load schedule & panels | routes Load schedule, Panels | `src/App.tsx:App` |
| App shell & navigation | Voltage drop | data link | `src/App.tsx:App` |
| App shell & navigation | Earthing & earth fault loop | calcProject, focus filter; earth schematic page | `src/App.tsx:App` |
| App shell & navigation | Protection coordination | calcProject, discrimination chain on SLD | `src/App.tsx:chain` |
| App shell & navigation | Protection coordination | ribbon/view routing; start checklist failing flag | `src/App.tsx:App; src/help/guide.ts:startChecklist` |
| App shell & navigation | Breaker & cable selection | data link | `src/App.tsx:blocked` |
| App shell & navigation | Breaker & cable selection | data link | `src/App.tsx:958` |
| App shell & navigation | Power factor correction | routes PFC page with live project | `src/App.tsx:App` |
| App shell & navigation | Busbar & busway | routes Busbar riser | `src/App.tsx:App` |
| App shell & navigation | UPS & solar PV | routes UPS and Solar PV | `src/App.tsx:App` |
| App shell & navigation | Load flow engines | external engine run on the SLD, engine compare page, OpenDSS export | `src/App.tsx:runSimulation` |
| App shell & navigation | Enclosure & Form 4 | routes Enclosure sizing | `src/App.tsx:App` |
| App shell & navigation | Cable schedule, tray & containment | data link | `src/App.tsx:App` |
| App shell & navigation | Design CAD core | useCad state, ribbon CAD tools via cadDo, pending drawing from OS | `src/App.tsx:cadDo` |
| App shell & navigation | Reports & exports | data link | `src/App.tsx:App` |
| App shell & navigation | Reports & exports | anonymised sample calculation report | `src/components/AnonymizedSampleDialog.tsx` |
| App shell & navigation | Revisions & changes | stage gate revision, revisions and changes pages | `src/App.tsx:issueStage` |
| App shell & navigation | Revisions & changes | views mounted, user name/initials, stage gate button | `src/App.tsx:1354,1664,1665` |
| App shell & navigation | Review, submissions & authority rules | submission offer bar, review, received docs, design references | `src/App.tsx:App` |
| App shell & navigation | Review, submissions & authority rules | views mounted, project-start rule-set choice and submission offer banner | `src/App.tsx:885` |
| App shell & navigation | Dashboard & readiness | projects list and project dashboard; to-do navigation | `src/App.tsx:App` |
| App shell & navigation | Dashboard & readiness | Overview and Projects views, breadcrumb, onGo navigation | `src/App.tsx:1601` |
| ELV systems | App shell & navigation | ELV page sends packages to the inbox | `src/App.tsx:App` |
| App shell & navigation | Headless CLI & MCP | ?lvds-export switches to the headless renderer | `src/main.tsx` |
| Component database & library | App shell & navigation | database sync on start and on each Excel save | `src/App.tsx:receiveDatabase` |
| Component database & library | App shell & navigation | Database view in the left menu | `src/App.tsx:DatabaseView` |
| App shell & navigation | Quick calcs & existing checks | routes Quick calcs | `src/App.tsx:App` |
| App shell & navigation | Quick calcs & existing checks | view 'calculators' renders QuickCalcs | `src/App.tsx:QuickCalcs` |
| Desktop wrapper (Electron) | App shell & navigation | window.lvds bridge, will-prevent-unload dialog, error log file | `electron/main.cjs` |
| Desktop wrapper (Electron) | App shell & navigation | data link | `electron/errorLog.cjs:watchWindow` |
| Project data & storage | Parameters & design rules | Project settings modal edits the design basis; feeder presets merged on open | `src/components/ProjectSettings.tsx:ProjectSettings` |
| Project data & storage | Parameters & design rules | parameters stored on Project; newProject defaults | `src/types.ts:newProject` |
| Project data & storage | Network / SLD editor & core calc | boards and feeders, permanent uids, delete panel with descendants | `src/model/edit.ts:deleteBoard` |
| Project data & storage | Network / SLD editor & core calc | project store, undo steps, autoRun flag saved | `src/App.tsx:setProject` |
| Load schedule & panels | Project data & storage | point counts re-derived from load items on open | `src/model/projectMigrate.ts:withItemCounts` |
| Load schedule & panels | Project data & storage | boards, feeders, spares; edits via setProject with undo | `src/App.tsx:1552` |
| Project data & storage | Earthing & earth fault loop | persistent earth pit IDs added on open and edit; earthing plan type checks | `src/App.tsx:normalised` |
| Project data & storage | Earthing & earth fault loop | earthingPlan and earthPitIds saved; pit IDs normalised on open and edit | `src/App.tsx:normalised` |
| Cable schedule, tray & containment | Project data & storage | cable reference numbers added on open and as a no-undo patch | `src/App.tsx:normalised` |
| Cable schedule, tray & containment | Project data & storage | data link | `src/calc/runs.ts:91` |
| CAD sheets, plot & title block | Project data & storage | markups, title-block templates and logo checked before a file opens |  |
| CAD sheets, plot & title block | Project data & storage | project name/info read; templates, pens, viewports, tables, markups saved in the project file | `src/types.ts:Project.titleTemplates` |
| Project data & storage | Dashboard & readiness | data link | `src/calc/dashboard.ts:204` |
| Project data & storage | Dashboard & readiness | ProjectMeta list, trash, archive, status and details written to the file | `src/App.tsx:patchProjectFile` |
| Project data & storage | Reports & exports | calculation record uses input issues; anonymized calc report | `src/docs/calcRecord.ts:49` |
| Project data & storage | Headless CLI & MCP | same shape check and migration; refuses newer-version files | `src/headless/project.ts:56` |
| Project data & storage | Headless CLI & MCP | project read with the app's shape check and migration; writes detected by the app's save hash check; refuses while a recovery copy exists | `src/headless/project.ts:parseProject` |
| Project data & storage | Equipment, BOQ & pricing | price list copy in the project; BOQ revisions hashed for unsaved/changed checks | `src/model/saveSafety.ts:projectFingerprint` |
| Project data & storage | Component database & library | user libraries synced to the database folder, not to the project | `src/database/librarySync.ts:LIBRARY_KEYS` |
| Review, submissions & authority rules | Parameters & design rules | design reference values and rule rows written into the project | `src/model/designReference.ts:applyReference` |
| Review, submissions & authority rules | Parameters & design rules | rule-set values written to project/study settings and designRules | `src/model/designReference.ts:applyReference` |
| Parameters & design rules | Network / SLD editor & core calc | voltage, ambient, VD limit and VD temperature used by the feeder evaluation; presets dropped on the SLD | `src/calc/electrical.ts:evaluateFeeder` |
| Parameters & design rules | Load schedule & panels | min wire and ELCB from study settings and design rules | `src/calc/loadSchedule.ts:minWireMm2` |
| Parameters & design rules | Load schedule & panels | min wire, ELCB mA, point template, design rules | `src/calc/loadSchedule.ts:minWireMm2` |
| Parameters & design rules | Transformer & generator | growth, transformer and generator loading limits | `src/calc/txGen.ts` |
| Parameters & design rules | Transformer & generator | future growth, transformer / generator max loading | `src/types.ts:settingsOf` |
| Parameters & design rules | Load flow engines | voltage, frequency and VD temperature sent to OpenDSS / Python; MV 11 kV fixed | `src/engines/opendss/exportDss.ts` |
| Parameters & design rules | Drawings, SLD sheets & register | {Name} text filled into SLD notes / title blocks; stage sheet status | `src/model/params.ts:fillParams` |
| Parameters & design rules | CAD sheets, plot & title block | {Name} text in title blocks and plan layouts | `src/model/titleBlock.ts` |
| Parameters & design rules | CAD sheets, plot & title block | {Parameters}: people, submission date, authority ref, custom values | `src/model/params.ts:paramList` |
| Parameters & design rules | Revisions & changes | stage gate issues a revision and baseline; parameter changes in revision diffs | `src/model/designStage.ts:advanceStage` |
| Parameters & design rules | Revisions & changes | stage gate issues a revision and sets the baseline | `src/model/designStage.ts:advanceStage` |
| Parameters & design rules | Dashboard & readiness | to-do split by design stage | `src/model/designStage.ts:splitByStage` |
| Parameters & design rules | Dashboard & readiness | scope (brief), design stage, transformer loading limit | `src/calc/projectReadiness.ts:splitTodo` |
| Parameters & design rules | Headless CLI & MCP | read-only project settings | `src/headless/tools.ts:103` |
| Component database & library | Desktop wrapper (Electron) | workbook read/write/watch, Library.json, database folder setting via IPC | `electron/main.cjs:initDatabase` |
| Component database & library | Desktop wrapper (Electron) | workbooks created, read, watched, written with Backups/ | `electron/database.cjs:writeBook / src/App.tsx:initDatabase` |
| Component database & library | Breaker & cable selection | Cables.xlsx R/X/ratings and Breakers.xlsx ratings/Icu steps | `src/database/database.ts:applyDatabase` |
| Component database & library | Breaker & cable selection | Cables.xlsx and Breakers.xlsx loaded into the calc | `src/database/database.ts:applyDatabase` |
| Component database & library | Voltage drop | cable R/X, motor-start VD limit rule | `src/calc/voltageDrop.ts:motorStartVdLimit` |
| Component database & library | Earthing & earth fault loop | cable R/X for earth fault loop | `src/calc/cableTable.ts:getCable` |
| Component database & library | Power factor correction | data link | `src/calc/pfcCalc.ts:rule` |
| Component database & library | Lighting & emergency lighting | Luminaires.xlsx for room lighting | `src/calc/roomLighting.ts:luminairesOf` |
| Component database & library | Lighting & emergency lighting | Luminaires.xlsx lumens, watts, SHR max, manufacturer | `src/calc/roomLighting.ts:luminairesOf` |
| Component database & library | Equipment, BOQ & pricing | breaker/cable/equipment/tx/gen/busway prices and price lists | `src/database/catalog.ts:catalogRate` |
| Component database & library | Equipment, BOQ & pricing | catalogue, cable and breaker prices (desktop app) | `src/database/catalog.ts:catalogRate` |
| Component database & library | CAD electrical (devices on plans) | library loads for CAD block loads, luminaires | `src/model/cadLoads.ts:pullCadLoads` |
| Component database & library | CAD electrical (devices on plans) | library loads for CAD block mapping | `src/model/cadLoads.ts:resolveBlock` |
| Component database & library | Parameters & design rules | Parameters.xlsx defaults for new projects and Apply to this project | `src/database/database.ts:applyParameters` |
| Component database & library | Enclosure & Form 4 | BRAND_DEVICES, device dims and enclosure catalogues synced via Library.json; board keeps frozen enclosure | `src/model/enclosureLibrary.ts:write` |
| Component database & library | Load flow engines | external engine request includes the active cable table | `src/engines/external.ts:cables` |
| Component database & library | Reports & exports | cable data source notice on reports | `src/calc/cableTable.ts:cableDataNotice` |
| Desktop wrapper (Electron) | Project data & storage | project open/save/stat with conflict check, recovery copies, trash, project list | `electron/main.cjs:projects:save / src/model/projectStore.ts:bridge` |
| Desktop wrapper (Electron) | Reports & exports | PDF bytes, text and binary exports; browser download / print dialog on the web | `src/util/files.ts:renderPdf` |
| Desktop wrapper (Electron) | Reports & exports | HTML to PDF in sandboxed hidden window | `electron/pdfRender.cjs:htmlToPdf` |
| Drawings, SLD sheets & register | Desktop wrapper (Electron) | DXF / SVG exports saved through files:saveText / saveBinary | `src/util/files.ts:saveText` |
| Drawings, SLD sheets & register | Desktop wrapper (Electron) | PDF rendering and printing of sheets | `electron/pdfRender.cjs:htmlToPdf` |
| Desktop wrapper (Electron) | CAD sheets, plot & title block | printer list and silent black-and-white print | `electron/pdfRender.cjs:htmlToPrinter` |
| Desktop wrapper (Electron) | CAD sheets, plot & title block | printing forced monochrome (color: false) | `electron/pdfRender.cjs:65` |
| Desktop wrapper (Electron) | Design CAD core | WebAssembly engine, drawing bytes, block folders, pending Open-with plans | `src/engines/cad/cadEngine.ts` |
| Desktop wrapper (Electron) | Design CAD core | drawing bytes from open dialog / path; save dialog and overwrite of a chosen copy | `electron/cadFile.cjs:readDrawingBytes` |
| Desktop wrapper (Electron) | Load flow engines | Python engine probe/run with timeout and output caps | `electron/engineRunner.cjs:runJsonProcess` |
| Desktop wrapper (Electron) | Load flow engines | Python process runner, IPC validation, Python path setting | `electron/engineRunner.cjs:runJsonProcess` |
| Desktop wrapper (Electron) | Dashboard & readiness | projects list meta for the dashboard | `electron/projectFiles.cjs:listProjectsMeta` |
| Desktop wrapper (Electron) | Headless CLI & MCP | headless DXF sheets / PDF reports through the app renderer | `electron/headlessExport.cjs:run / src/headless/electronExport.ts:runInRenderer` |
| Desktop wrapper (Electron) | Headless CLI & MCP | hidden Electron export window, --lvds-headless-export in main.cjs, recovery folder and settings read | `electron/headlessExport.cjs:run` |
| Voltage drop | Headless CLI & MCP | vdPct/vdTotalPct per circuit, quick voltage drop | `src/headless/tools.ts:circuitRow` |
| Voltage drop | Headless CLI & MCP | vdPct / vdTotalPct in results; VD report via export tools | `src/headless/tools.ts:299` |
| Protection coordination | Headless CLI & MCP | selectivity failures in run_checks; no TCC data | `src/headless/tools.ts:circuitIssues` |
| Protection coordination | Headless CLI & MCP | selectivity issues per circuit | `src/headless/tools.ts:circuitIssues` |
| Breaker & cable selection | Headless CLI & MCP | size_circuits, add_circuit, calc_cable_size use recommend/selectCable | `src/headless/editTools.ts:size_circuits` |
| Breaker & cable selection | Headless CLI & MCP | size circuits / add circuit tools | `src/headless/editTools.ts:160` |
| Transformer & generator | Headless CLI & MCP | transformer loading and generators in project_summary; calc_transformer | `src/headless/tools.ts:project_summary` |
| Cable schedule, tray & containment | Headless CLI & MCP | cable, tray and containment schedules as reports only | `src/headless/exportTools.ts:export_report` |
| Cable schedule, tray & containment | Headless CLI & MCP | same exports through CATALOGUE | `src/headless/exportTools.ts:8` |
| Equipment, BOQ & pricing | Headless CLI & MCP | BOQ workbook with the same buildBom/priceBom/numberBom path as BomView | `src/headless/exportTools.ts:export_boq_xlsx` |
| Design CAD core | Headless CLI & MCP | DWG/DXF read by readCadDrawing (WASM inlined in the CLI) | `src/headless/cadTools.ts:readPlan` |
| Headless CLI & MCP | CAD electrical (devices on plans) | rooms from CAD with the same sequence as floorPlanActions.putRooms; ELV devices placed on levels | `src/headless/cadTools.ts:rooms_from_cad` |
| Reports & exports | Headless CLI & MCP | all Export centre catalogue entries as HTML, or PDF through the hidden window | `src/headless/exportTools.ts:export_report` |
| Reports & exports | Headless CLI & MCP | CLI/MCP reuses the export catalogue | `src/headless/exportTools.ts` |
| Headless CLI & MCP | Revisions & changes | value changes added as proposed modification records | `src/headless/editTools.ts:proposal` |
| Headless CLI & MCP | Revisions & changes | headless edit tools create modification records; listing shows latest revision | `src/headless/editTools.ts` |
| Headless CLI & MCP | ELV systems | ELV estimate, devices, schedules, loads placement and loads package | `src/headless/elvTools.ts:ELV_TOOLS` |
| Headless CLI & MCP | ELV systems | elv_devices, elv_schedules, elv_place_devices, elv_estimate, elv_place_loads | `src/headless/elvTools.ts:ELV_TOOLS` |
| Headless CLI & MCP | Data exchange & inbox | package check/review/apply; rooms and design package exports exist only here | `src/headless/exchangeTools.ts:EXCHANGE_TOOLS` |
| Headless CLI & MCP | Data exchange & inbox | exchange_check/review/apply and export tools | `src/headless/exchangeTools.ts:EXCHANGE_TOOLS` |
| Quick calcs & existing checks | Headless CLI & MCP | calc_* share src/calc/quick.ts with QuickCalcs | `src/headless/tools.ts:TOOLS` |
| Quick calcs & existing checks | Headless CLI & MCP | seven quick formulas as MCP/CLI tools | `src/headless/tools.ts:calc_cable_size` |
| Headless CLI & MCP | Building & load assessment | add_building / add_level; no load assessment numbers returned | `src/headless/buildingTools.ts:BUILDING_TOOLS` |
| Headless CLI & MCP | Building & load assessment | add-building and add-level commands | `src/headless/buildingTools.ts` |
| Component database & library | Building & load assessment | transformer and generator sizes, room types (RoomTypes.xlsx), flat layouts (UnitTypes.xlsx) | `src/calc/loadAssessment.ts:txSizesOf` |
| Parameters & design rules | Building & load assessment | watts per point, points per circuit and meter limits for generated DBs | `src/calc/buildingDesign.ts:genPointWatts` |
| Network / SLD editor & core calc | Building & load assessment | board demand for the designed-so-far comparison and DB check | `src/calc/building.ts:dbChecks` |
| Network / SLD editor & core calc | Building & load assessment | floors and riser lengths for Build hierarchy | `src/model/hierarchyBuilder.ts:planBatchHierarchy` |
| Building & load assessment | Load schedule & panels | DBs, circuits and incomers generated from rooms and flats | `src/calc/buildingDesign.ts:generateBuildingDbs` |
| Building & load assessment | Load schedule & panels | DB against rooms check and built-up area for the MD sheet | `src/calc/building.ts:builtUpAreaOf` |
| Building & load assessment | Load schedule & panels | Generate DBs creates circuits; rooms served check; building summary TCL | `src/calc/buildingDesign.ts:139` |
| Building & load assessment | Breaker & cable selection | assessment feeders and generated incomers sized with recommend optimise | `src/calc/loadAssessmentMdb.ts:createMdbFromAssessment` |
| Building & load assessment | Breaker & cable selection | auto-sizing in building generation and MDB | `src/calc/buildingDesign.ts:152` |
| Building & load assessment | Space planning & substation | space planning areas from the rooms | `src/calc/building.ts:spaceAreasFromRooms` |
| Building & load assessment | Space planning & substation | rooms and room types become areas and use types; floors checked against levels | `src/calc/building.ts:spaceAreasFromRooms` |
| Building & load assessment | Busbar & busway | building summary (floors, heights) for busbar risers | `src/calc/building.ts:summarizeBuilding` |
| Building & load assessment | Busbar & busway | floors and demand per level | `src/calc/busbar.ts:riserFromBuilding` |
| Building & load assessment | Drawings, SLD sheets & register | floor list used by riser and DB riser diagrams | `src/model/levels.ts:floorList` |
| Building & load assessment | Drawings, SLD sheets & register | buildings, levels and typical floors for riser rows | `src/model/dbRiser.ts:dbRiserLayout` |
| CAD electrical (devices on plans) | Building & load assessment | rooms traced on CAD plans written into Building information | `src/model/cadRooms.ts` |
| CAD electrical (devices on plans) | Building & load assessment | levels and rooms in; rooms with outline/area and board level/room out | `src/model/cadRooms.ts:applyRooms` |
| Building & load assessment | Reports & exports | load assessment section in Design Basis (PDF, Word), concept report, building summary in export centre | `src/docs/designBasis.ts:loadAssessmentBasis` |
| Building & load assessment | Reports & exports | load assessment in design basis when inReport; building summary | `src/docs/designBasis.ts:buildDesignBasis` |
| Building & load assessment | Dashboard & readiness | readiness items Building and GFA, Load assessment; DB checks on the dashboard | `src/calc/projectReadiness.ts:59` |
| Building & load assessment | Dashboard & readiness | GFA, levels, dbChecks in; designed demand out to load assessment | `src/components/docs/LoadAssessmentView.tsx:41` |
| Building & load assessment | Project data & storage | building, loadAssessment and brief saved in the project file, undo steps, change classes | `src/types.ts:653` |
| Network / SLD editor & core calc | Space planning & substation | SLD main boards (sourceKva, rmu) as fallback for DM substations | `src/calc/dmSubstation.ts:substationsFromProject` |
| Space planning & substation | Breaker & cable selection | created breakers and cables sized by applyAllRecommendations | `src/model/planToSld.ts:planToSld` |
| Space planning & substation | Reports & exports | DM-D-013 PDF in Export centre; DM room areas in the concept report | `src/components/docs/exportCatalogue.ts:dm-form` |
| Space planning & substation | Reports & exports | DM-D-013 substation form in export centre | `src/components/docs/exportCatalogue.ts:CATALOGUE` |
| Space planning & substation | Revisions & changes | spacePlan and substations diffed and change-classed | `src/model/revisions.ts:DATA_SETS` |
| Space planning & substation | Project data & storage | saved as project.spacePlan and project.substations; Create SLD is one undo step | `src/types.ts:Project` |
| Space planning & substation | Desktop wrapper (Electron) | DM form printed to PDF via savePdf | `src/components/docs/SubstationAreaView.tsx:exportPdf` |
| Network / SLD editor & core calc | Load schedule & panels | per-phase P/Q for incomers; results to board sheets and schedules | `src/calc/electrical.ts:incomerBasis` |
| Network / SLD editor & core calc | Load schedule & panels | per-phase demand P/Q behind an incomer | `src/calc/electrical.ts:incomerBasis` |
| Network / SLD editor & core calc | Voltage drop | Ib, VD, incomer basis, boardDemandKw | `src/calc/voltageDrop.ts` |
| Network / SLD editor & core calc | Voltage drop | boards, feeders, supply tree in; cable edits out; SLD colour by VD | `src/calc/voltageDrop.ts:editVdCable` |
| Network / SLD editor & core calc | Protection coordination | evaluateFeeder and busbar fault level for selectivity | `src/calc/protection.ts:evaluateSelectivity` |
| Network / SLD editor & core calc | Protection coordination | maximum fault Ik'' at each board (impedanceToBoard, faultCurrentKA, evaluateFeeder.breakerFaultKA) and board topology | `src/calc/protection.ts:selectivityPair` |
| Network / SLD editor & core calc | Protection coordination | selected circuit's breaker chain coloured on the SLD | `src/App.tsx:App (chain memo)` |
| Network / SLD editor & core calc | Busbar & busway | fault level and upstream VD at boards | `src/calc/busbar.ts` |
| Network / SLD editor & core calc | Busbar & busway | fault level at source board and at each board | `src/calc/busbar.ts:sizeRiser` |
| Network / SLD editor & core calc | UPS & solar PV | boardTotals | `src/calc/ups.ts` |
| Network / SLD editor & core calc | UPS & solar PV | UPS load from the board demand (boardTotals) | `src/calc/ups.ts:upsLoad` |
| Network / SLD editor & core calc | UPS & solar PV | selected UPS kVA written to board.upsKva | `src/components/studies/UpsStudy.tsx:UpsStudy` |
| Cable schedule, tray & containment | Network / SLD editor & core calc | tray grouping factor for Iz | `src/calc/electrical.ts:trayFactorOf` |
| Cable schedule, tray & containment | Network / SLD editor & core calc | feeders: size, cores, parallel runs, board, trayRoute, length | `src/calc/cableTray.ts:trayLines` |
| Network / SLD editor & core calc | Drawings, SLD sheets & register | SystemDiagram, SingleLineDiagram, results and annotations on sheets | `src/components/cad/CadSheets.tsx` |
| Network / SLD editor & core calc | Drawings, SLD sheets & register | boards, feeders, ties and fresh results drawn off-screen with SystemDiagram / SingleLineDiagram | `src/components/docs/sheetRender.tsx:renderSheet` |
| Network / SLD editor & core calc | Reports & exports | evaluateProject, boardSummary and the run for reports and exports | `src/docs/calcReport.ts` |
| Network / SLD editor & core calc | Reports & exports | feeder results, fault levels, board summaries, SLD drawing | `src/docs/calcReport.ts:calcReportData` |
| Network / SLD editor & core calc | Revisions & changes | data link | `src/model/designChanges.ts` |
| Network / SLD editor & core calc | Revisions & changes | boards and feeders compared field by field; board demand kW | `src/model/revisions.ts:diffProjects` |
| Network / SLD editor & core calc | Review, submissions & authority rules | data link | `src/App.tsx:ReviewView` |
| Network / SLD editor & core calc | Review, submissions & authority rules | whole-network results for proposal preview; feeders/boards for comment stamps | `src/model/proposalPreview.ts:previewProposal` |
| Network / SLD editor & core calc | Dashboard & readiness | data link | `src/calc/dashboard.ts` |
| Network / SLD editor & core calc | Dashboard & readiness | demand, PF, transformer kVA from systemSummary; last CalcRun | `src/calc/dashboard.ts:buildDashboard` |
| Network / SLD editor & core calc | Data exchange & inbox | runCalculations for design export | `src/exchange/designExport.ts` |
| Network / SLD editor & core calc | Data exchange & inbox | boards, circuits and calculation run for the design export | `src/exchange/designExport.ts:designExport` |
| Network / SLD editor & core calc | Headless CLI & MCP | runCalculations and moveBoard in headless tools | `src/headless/tools.ts` |
| Network / SLD editor & core calc | Quick calcs & existing checks | recorded MD in; selectCableRuns / faultCurrentKA out | `src/model/existing.ts:recordedPQ` |
| Network / SLD editor & core calc | Quick calcs & existing checks | R/X, cable impedance, fault formula, selectCableRuns reused by quick cards | `src/calc/quick.ts:cableFor` |
| Network / SLD editor & core calc | Quick calcs & existing checks | recorded MD as covering P/Q in board totals; MD label on system diagram | `src/model/existing.ts:recordedPQ` |
| Network / SLD editor & core calc | Enclosure & Form 4 | BoardPanel link to enclosure sizing | `src/components/BoardPanel.tsx:onEnclosure` |
| Network / SLD editor & core calc | Enclosure & Form 4 | MDB/SMDB feeders and ratings counted into Form-4 columns; incomer from feeder above | `src/model/form4Count.ts:form4FromSld` |
| Breaker & cable selection | Load schedule & panels | auto sizing of MCB and wire | `src/model/schedule.ts:refresh` |
| Breaker & cable selection | Load schedule & panels | incomer per-phase P/Q in; auto-sizing on schedule edits and MD sheet out | `src/model/schedule.ts:20` |
| Load schedule & panels | Earthing & earth fault loop | ELCB sensitivity per schedule circuit; earth fault preview | `src/calc/earthing.ts:rcdOf` |
| Load schedule & panels | Earthing & earth fault loop | ELCB groups and circuit RCDs, circuit purpose | `src/calc/earthing.ts:rcdOf` |
| Load schedule & panels | Earthing & earth fault loop | earth fault result in the circuit edit preview | `src/model/circuitEdit.ts:previewCircuit` |
| Load schedule & panels | Equipment, BOQ & pricing | ELCBs and spare breakers in the BOQ | `src/calc/bom.ts:135` |
| Load schedule & panels | Equipment, BOQ & pricing | final circuits, ELCB groups, spare ways, optional point counts | `src/calc/bom.ts:buildBom` |
| Load schedule & panels | Enclosure & Form 4 | ELCB groups in enclosure device lists | `src/model/enclosureLibrary.ts:136` |
| Load schedule & panels | Enclosure & Form 4 | final circuits, ELCB groups, spare ways for the DB device list | `src/model/enclosureLibrary.ts:neededDevices` |
| Load schedule & panels | Busbar & busway | riser form TCL / DF | `src/docs/riserForm.ts:58` |
| Load schedule & panels | Busbar & busway | floor demand kW / signed kvar from a board | `src/calc/busbar.ts:sizeRiser` |
| Load schedule & panels | Drawings, SLD sheets & register | board-wise SLD sheets with phase balance and panel summary | `src/docs/boardSheets.ts:boardSheetPages` |
| Load schedule & panels | Drawings, SLD sheets & register | load schedule under DB sheets; connected kW per phase and panel DF for the riser form | `src/docs/loadScheduleDoc.ts:scheduleTable` |
| Load schedule & panels | CAD sheets, plot & title block | DB schedule table on CAD sheets | `src/components/docs/sheetRender.tsx:scheduleTable` |
| Load schedule & panels | Reports & exports | schedule PDF/CSV, submission workbook, issue package, phase balance in study report | `src/docs/panelScheduleDocs.ts:panelScheduleDocs` |
| Load schedule & panels | Reports & exports | phase balance, panel schedules in issue package, load schedules in export centre | `src/components/docs/StudyReportsView.tsx:exportPack` |
| Load schedule & panels | Headless CLI & MCP | form workbook export and delete circuit | `src/headless/exportTools.ts:214` |
| Component database & library | Load schedule & panels | WATT/UNIT from Loads.xlsx; standard loads dialog writes the library | `src/database/database.ts:412` |
| Power factor correction | Load schedule & panels | switched capacitor steps in board P/Q | `src/calc/loadSchedule.ts:boardPhasePQ` |
| Power factor correction | Load schedule & panels | load types/PF in; per-phase switched kvar out | `src/calc/loadSchedule.ts:boardPhasePQ` |
| Quick calcs & existing checks | Load schedule & panels | recorded maximum demand of existing boards | `src/calc/loadSchedule.ts:boardPhasePQ` |
| Quick calcs & existing checks | Load schedule & panels | recorded MD in panel load totals | `src/calc/loadSchedule.ts:boardPhasePQ` |
| Load schedule & panels | Voltage drop | DB load per phase (P, Q) and final circuits | `src/calc/loadSchedule.ts:boardPhasePQ` |
| Parameters & design rules | Voltage drop | vdLimitPct and vdTempC project parameters | `src/calc/voltageDrop.ts:vdRow` |
| Voltage drop | Breaker & cable selection | same VD basis for cable selection (vdEvaluator, feederVdPctAt, vdTempC) | `src/calc/electrical.ts:feederVdPctAt` |
| Voltage drop | Breaker & cable selection | same VD basis for every candidate size | `src/calc/electrical.ts:feederVdPctAt` |
| Power factor correction | Voltage drop | switched capacitor kvar in incomer Q | `src/calc/loadSchedule.ts:boardPhasePQOf` |
| Busbar & busway | Voltage drop | riser VD shown on page and report | `src/calc/busbar.ts:riserVd` |
| Busbar & busway | Voltage drop | riser VD in VD study and report | `src/components/studies/VoltageDropStudy.tsx:risers` |
| Voltage drop | Load flow engines | R factor to OpenDSS/external engines; engine compare of vdTotalPct | `src/engines/opendss/exportDss.ts:72` |
| Voltage drop | Cable schedule, tray & containment | Vd cable % and Vd total % in the cable schedule | `src/docs/schedules.ts:cableSchedule` |
| Voltage drop | Reports & exports | VD PDF/CSV, Export centre entry, load-flow motor-start table, calc report VD verification | `src/docs/voltageDropReport.ts:buildVdReportHtml` |
| Voltage drop | Reports & exports | lf section and standalone VD report | `src/components/docs/exportCatalogue.ts:CATALOGUE` |
| Voltage drop | Project data & storage | vdSelection, vdReportDocNo, vdFinalCircuits, vdTempC, vdLimitPct saved and validated | `src/types.ts:555` |
| Voltage drop | Revisions & changes | VD parameters classed as engineering changes | `src/model/changeClass.ts:34` |
| Network / SLD editor & core calc | Earthing & earth fault loop | board tree, incomers, feeders for the loop walk | `src/calc/earthing.ts:earthLoopPath` |
| Network / SLD editor & core calc | Earthing & earth fault loop | earth status colouring on the SLD; planned pit IDs on the main earthing detail | `src/components/SystemDiagram.tsx:plannedEarthPits` |
| Breaker & cable selection | Earthing & earth fault loop | cable R20/X and CPC size (same cpcOf, no copy) | `src/calc/cableTable.ts:cpcOf` |
| Breaker & cable selection | Earthing & earth fault loop | breakerTypeOf default device type | `src/calc/earthing.ts:breakerTypeOf` |
| Transformer & generator | Earthing & earth fault loop | transformer kVA, Z %, X/R for Ze; transformer units for the schematic | `src/model/earthingPlan.ts:txUnits` |
| Transformer & generator | Earthing & earth fault loop | transformer units per board (n1 / split) | `src/model/earthingPlan.ts:txUnits` |
| Building & load assessment | Earthing & earth fault loop | buildings, levels and panel levels for earth riser sheets | `src/model/earthRiser.ts:earthRiserLayout` |
| Earthing & earth fault loop | Reports & exports | earth fault loop study section, calc sections, calculation report | `src/docs/studyReport.ts:baseSection` |
| Earthing & earth fault loop | Drawings, SLD sheets & register | board sheet earth line and incomer CPC I2t; earthing, riser and floor sheets | `src/model/boardEarth.ts:boardEarth` |
| Earthing & earth fault loop | Drawings, SLD sheets & register | earthing schematic, earth riser and floor earthing sheets with count checks | `src/model/drawingSet.ts:earthSheetGaps` |
| Earthing & earth fault loop | CAD sheets, plot & title block | earthing / earth riser / floor earthing sheets in Design CAD Sheets | `src/components/docs/sheetRender.tsx` |
| Earthing & earth fault loop | Protection coordination | breakerTypeOf / instantaneousTripA shared with selectivity | `src/calc/protection.ts` |
| Earthing & earth fault loop | Protection coordination | shared device-type default and sure-trip magnetic current | `src/calc/earthing.ts:instantaneousTripA` |
| Earthing & earth fault loop | Dashboard & readiness | earth fault failures in dashboard tallies and to-do | `src/calc/dashboard.ts` |
| Earthing & earth fault loop | Dashboard & readiness | earth fault loop results from CalcRun.earthing | `src/calc/dashboard.ts:buildDashboard` |
| Earthing & earth fault loop | Headless CLI & MCP | earth fault issues in the to-do tool; earthing schematic DXF | `src/headless/exportTools.ts:SHEET_TYPES` |
| Earthing & earth fault loop | Revisions & changes | pit IDs frozen for revision compare | `src/model/revisions.ts` |
| Earthing & earth fault loop | Revisions & changes | earthing plan compared after pit-ID normalisation | `src/model/revisions.ts:diffProjects` |
| Earthing & earth fault loop | Quick calcs & existing checks | txUnits used by existing-installation checks | `src/calc/existing.ts` |
| Project data & storage | Protection coordination | breaker rating, type, Im multiple, Icu saved on Feeder | `src/types.ts:Feeder` |
| Protection coordination | Reports & exports | discrimination section table, criteria, compliance row, limitation notes | `src/docs/studyReport.ts:buildSection` |
| Protection coordination | Dashboard & readiness | to-do items for not / partly selective pairs | `src/calc/dashboard.ts:buildDashboard` |
| Protection coordination | Dashboard & readiness | selectivity results from CalcRun.selectivity | `src/calc/dashboard.ts:buildDashboard` |
| Protection coordination | Revisions & changes | data link | `src/model/designImpact.ts:impactBetween` |
| Protection coordination | Review, submissions & authority rules | selectivity status changes in proposal preview | `src/model/proposalPreview.ts:circuitChanges` |
| Breaker & cable selection | Project data & storage | feeder fields read; applied recommendations written back via setProject | `src/App.tsx:1584` |
| Parameters & design rules | Breaker & cable selection | ambient, VD limit, VD temperature, ground temperature, soil resistivity, strict cable data | `src/types.ts:554` |
| Cable schedule, tray & containment | Breaker & cable selection | tray route grouping, bunched and buried factors | `src/calc/electrical.ts:trayFactorOf` |
| Cable schedule, tray & containment | Breaker & cable selection | burial derating tables shared with the cable rating | `src/calc/installation.ts:ratingBasis` |
| Breaker & cable selection | Network / SLD editor & core calc | evaluateFeeder, fault level, upstream VD in; quick fixes and auto-sizing of new feeders out | `src/components/SystemDiagram.tsx:1830` |
| Breaker & cable selection | Power factor correction | subtree for focus in; capacitor feeder sizing (1.43 x Ib) out | `src/calc/pfc.ts:145` |
| Breaker & cable selection | Power factor correction | bank breaker ≥ 1.43 × Ib and cable Iz ≥ In | `src/calc/sizing.ts:recommend` |
| Breaker & cable selection | CAD electrical (devices on plans) | plan-to-SLD sizing with applyAllRecommendations | `src/model/planToSld.ts:93` |
| Breaker & cable selection | ELV systems | ELV power feeder sizing | `src/calc/elvPlacement.ts:153` |
| Breaker & cable selection | UPS & solar PV | PV feeder sizing | `src/model/pvFeeder.ts:32` |
| Breaker & cable selection | Reports & exports | rating basis table and cable data notice | `src/docs/studyReport.ts:267` |
| Breaker & cable selection | Reports & exports | cable section, cable-data source, fire-rated warnings | `src/docs/studyReport.ts:baseSection` |
| Breaker & cable selection | Drawings, SLD sheets & register | cable data notice and cable type on SLD sheets | `src/docs/sldSheet.ts:222` |
| Breaker & cable selection | Dashboard & readiness | ambient, cable data and ground to-do findings | `src/calc/dashboard.ts:205` |
| Breaker & cable selection | Dashboard & readiness | cable / breaker / Icu checks from CalcRun.results; cable data, ambient, ground checks | `src/calc/dashboard.ts:buildDashboard` |
| Breaker & cable selection | Load flow engines | cable R/X/ampacity to external engine and OpenDSS | `src/engines/external.ts:11` |
| Breaker & cable selection | Equipment, BOQ & pricing | cable rate per metre and cable type | `src/data/rates.ts:22` |
| Breaker & cable selection | Data exchange & inbox | cable type and install method in design export | `src/exchange/designExport.ts:53` |
| Transformer & generator | Network / SLD editor & core calc | boards, feeders, ties in; sourceKva / Z % / busbar and standby kVA written back | `src/calc/txGen.ts:applyTransformer` |
| Load schedule & panels | Transformer & generator | load-schedule circuits are project.feeders summed by boardTotals; per-phase kW and D.F for the TCL form | `src/docs/txSummary.ts:buildTxSummary` |
| Power factor correction | Transformer & generator | planned kvar taken off the transformer demand | `src/calc/txGen.ts:sizeTransformers` |
| Power factor correction | Transformer & generator | transformer kVA in; planned kvar off transformer demand out | `src/calc/txGen.ts:sizeTransformers` |
| Transformer & generator | Protection coordination | applied transformer kVA / Z % set the fault levels | `src/calc/electrical.ts:impedanceToBoard` |
| Transformer & generator | Breaker & cable selection | applied transformer sets Icu requirement for feeders | `src/calc/sizing.ts:recommend` |
| Transformer & generator | Load flow engines | standby kVA drives the generator supply scenario | `src/calc/scenario.ts:generatorScenario` |
| Transformer & generator | Load flow engines | transformer kVA/%Z/X-R and closed bus ties (parallel transformers) | `src/engines/opendss/exportDss.ts:exportDss` |
| Transformer & generator | Equipment, BOQ & pricing | changeover breakers and ATS in the BOM | `src/calc/bom.ts:151` |
| Transformer & generator | Equipment, BOQ & pricing | transformer kVA and units, generator kVA, changeover/ATS | `src/calc/bom.ts:buildBom:176` |
| Transformer & generator | Drawings, SLD sheets & register | changeover incomers and ATS labels on the SLD | `src/diagram/ChangeoverSym.tsx:ChangeoverIncomers` |
| Transformer & generator | Reports & exports | study report, calc report, design basis, compliance, TCL summary in Excel | `src/docs/studyReport.ts` |
| Quick calcs & existing checks | Transformer & generator | existing-installation checks shown on the sizing page | `src/components/studies/SizingStudy.tsx:ExistingChecksCard` |
| Quick calcs & existing checks | Transformer & generator | ExistingChecksCard on the sizing page; starting kVA and dip for generator sizing | `src/components/studies/SizingStudy.tsx:SizingStudy` |
| Power factor correction | Network / SLD editor & core calc | board P/Q in; capacitor ways out; switched kvar in board totals | `src/calc/summary.ts:boardTotalsOf` |
| Parameters & design rules | Power factor correction | PF target, system voltage | `src/calc/pfc.ts:planPfc` |
| Power factor correction | Reports & exports | study report section, calc report, export catalogue PDF, design basis | `src/docs/studyReport.ts:pfcSection` |
| Power factor correction | Reports & exports | PFC plan section and compliance rows; network plan not a standalone export-centre entry | `src/docs/studyReport.ts:pfcSection` |
| Power factor correction | Dashboard & readiness | no-bank warnings, readiness scope | `src/calc/dashboard.ts:181` |
| Review, submissions & authority rules | Power factor correction | authority minimum PF from rules | `src/calc/pfcCalc.ts:calcPfc` |
| Review, submissions & authority rules | Power factor correction | PF target | `src/calc/summary.ts:62` |
| Power factor correction | Revisions & changes | pfc and pfcCalc tracked in revisions | `src/model/revisions.ts:149` |
| Power factor correction | Project data & storage | project.pfc and project.pfcCalc saved; plan boards integrity-checked | `src/model/integrity.ts:55` |
| Parameters & design rules | Busbar & busway | voltage, ambient, VD limit | `src/calc/busbar.ts:sizeRiser` |
| Busbar & busway | Reports & exports | busbar riser study section and riser form | `src/docs/studyReport.ts:buildSection` |
| Busbar & busway | Dashboard & readiness | to-do for failed Icw and risers above the data | `src/calc/dashboard.ts:184` |
| Busbar & busway | Dashboard & readiness | busway risers and board busbar Icw | `src/calc/dashboard.ts:buildDashboard` |
| Busbar & busway | Revisions & changes | busRisers, busbarData, busbarIcwKa tracked | `src/model/revisions.ts` |
| Transformer & generator | UPS & solar PV | standby generator kVA for the leading-kvar check | `src/calc/ups.ts:checkUpsLeading` |
| Parameters & design rules | UPS & solar PV | project voltage for the PV AC current | `src/components/studies/SolarStudy.tsx:SolarStudy` |
| UPS & solar PV | Load flow engines | PV feeder as sgen (Python) / Generator (OpenDSS) | `engines/python/lvds_engine.py:397` |
| UPS & solar PV | Equipment, BOQ & pricing | PV modules, inverters, DC isolators, SPDs, connectors in the BOM | `src/calc/bom.ts:263` |
| UPS & solar PV | Equipment, BOQ & pricing | PV modules, inverters, strings from sizePv | `src/calc/bom.ts:buildBom:263` |
| UPS & solar PV | Reports & exports | UPS and PV PDF reports in the export centre | `src/components/docs/exportCatalogue.ts:114` |
| UPS & solar PV | Reports & exports | one-line UPS / PV entries in the design basis | `src/docs/designBasis.ts:163` |
| UPS & solar PV | Dashboard & readiness | UPS failures and PV status in the to-do list | `src/calc/dashboard.ts:186` |
| UPS & solar PV | Revisions & changes | UPS diff, proposals and re-run flags; PV re-run flag | `src/model/designImpact.ts:83` |
| UPS & solar PV | Revisions & changes | UPS systems compared and proposable | `src/model/designChanges.ts:PROPOSABLE` |
| UPS & solar PV | Headless CLI & MCP | report export only; no sizing tool | `src/components/docs/exportCatalogue.ts:114` |
| Network / SLD editor & core calc | Load flow engines | built-in results (evaluateProject), R factor, X/R default, transformer impedance | `src/engines/builtin.ts:builtinEngine` |
| Project data & storage | Load flow engines | boards, feeders, ties, voltage, frequency, vdTempC | `src/types.ts:Project` |
| Load schedule & panels | Load flow engines | per-phase demand for the unbalanced flow | `src/calc/unbalancedFlow.ts:flow` |
| Load flow engines | Reports & exports | unbalanced flow tables in the Phase balance study report; .dss file save | `src/docs/studyReport.ts:buildSection` |
| Load flow engines | Reports & exports | unbalanced load flow in phase section | `src/docs/studyReport.ts:baseSection` |
| Load flow engines | CAD sheets, plot & title block | data link | `src/components/cad/CadSheets.tsx:CadSheets` |
| Parameters & design rules | Quick calcs & existing checks | project voltage, ambient, VD limit as quick defaults; transformer loading limit for existing check | `src/components/QuickCalcs.tsx:QuickCalcs` |
| Quick calcs & existing checks | Voltage drop | starter multiple for motor-start voltage drop | `src/calc/voltageDrop.ts:starterInfo` |
| Lighting & emergency lighting | Quick calcs & existing checks | lumen method for the lux tab | `src/components/QuickCalcs.tsx:lumenMethod` |
| Lighting & emergency lighting | Quick calcs & existing checks | quick lux calculator and setting-out plan | `src/components/QuickCalcs.tsx:lumenMethod` |
| Quick calcs & existing checks | Equipment, BOQ & pricing | existing boards and feeders left out of the BOQ | `src/calc/bom.ts` |
| Quick calcs & existing checks | Reports & exports | existing checks table in sizing section of study and calculation report | `src/docs/studyReport.ts:buildSection` |
| Component database & library | Quick calcs & existing checks | cable table and breaker ratings from database | `src/calc/cableTable.ts:cables` |
| Transformer & generator | Enclosure & Form 4 | ACB mains/generator changeover adds a second incomer cubicle | `src/model/form4Count.ts:form4FromSld` |
| Earthing & earth fault loop | Enclosure & Form 4 | breakerTypeOf default (MCB <= 63 A, else MCCB) used for device kind | `src/calc/earthing.ts:breakerTypeOf` |
| Enclosure & Form 4 | Project data & storage | frozen Board.enclosure / Board.form4 saved in project file with undo step | `src/components/EnclosureSizing.tsx:use` |
| Enclosure & Form 4 | Equipment, BOQ & pricing | enclosure size and supplier extra busbar written into panel BOQ line and key | `src/calc/bom.ts:110` |
| Enclosure & Form 4 | Equipment, BOQ & pricing | enclosure / Form-4 text in the panel line; brand refs from BRAND_DEVICES | `src/calc/bom.ts:buildBom:110` |
| Enclosure & Form 4 | Parameters & design rules | page gated to the detailed design stage | `src/model/designStage.ts:42` |
| Enclosure & Form 4 | Desktop wrapper (Electron) | A4 PDF size sheets via savePdf; DXF via saveText | `src/components/Form4Sizing.tsx:exportSheet` |
| Lighting & emergency lighting | CAD electrical (devices on plans) | room outlines in; lighting and emergency points out as LvPoints | `src/model/cadDevices.ts:placeLvPoint` |
| Building & load assessment | Lighting & emergency lighting | room type target lux and level height for defaults | `src/calc/roomLighting.ts:roomLightingDefaults` |
| Lighting & emergency lighting | Equipment, BOQ & pricing | luminaire types and counts as BOQ lines and a Luminaire schedule sheet | `src/calc/bom.ts:buildBom` |
| Lighting & emergency lighting | Equipment, BOQ & pricing | luminaires and emergency fittings by type | `src/model/luminaireSchedule.ts:luminaireSchedule` |
| Lighting & emergency lighting | Drawings, SLD sheets & register | emergency symbols drawn on plan sheets | `src/docs/planLayout.ts` |
| Load schedule & panels | Cable schedule, tray & containment | final circuits optionally put on trays | `src/calc/cableTray.ts:trayFeeders` |
| CAD electrical (devices on plans) | Cable schedule, tray & containment | tray route paths, route lengths, bends/tees/reducers and feeder lengths from CAD plans | `src/model/cadPlanSchedules.ts:updateSchedules` |
| CAD electrical (devices on plans) | Cable schedule, tray & containment | tray route lengths, fittings and feeder tray routes from plans | `src/model/cadTrays.ts:applyCadTrays` |
| Cable schedule, tray & containment | Equipment, BOQ & pricing | tray metres, fittings, supports, couplers, covers (BOQ section H) | `src/calc/bom.ts:336` |
| Cable schedule, tray & containment | Equipment, BOQ & pricing | tray lengths and fittings | `src/calc/bom.ts:buildBom:336` |
| Cable schedule, tray & containment | Reports & exports | cable schedule, tray schedule and containment exports in the export centre and study report | `src/components/docs/exportCatalogue.ts:122` |
| Cable schedule, tray & containment | Reports & exports | cable schedule, tray schedule, containment PDFs | `src/components/docs/exportCatalogue.ts:CATALOGUE` |
| Cable schedule, tray & containment | Drawings, SLD sheets & register | cable reference numbers and fire-rated note on SLD sheets | `src/model/cableRefs.ts:cableRefsUsed` |
| Cable schedule, tray & containment | Drawings, SLD sheets & register | fire-rated cable types and cable reference numbers / cable schedule | `src/model/cableRefs.ts:cableRefsUsed` |
| Cable schedule, tray & containment | Design CAD core | tray fitting labels on the CAD canvas and CAD export | `src/model/cadTrayFittings.ts:trayFittings` |
| Cable schedule, tray & containment | CAD sheets, plot & title block | tray fitting counts on plan sheets | `src/docs/planLayout.ts:485` |
| Component database & library | Cable schedule, tray & containment | standard cable reference list (CableSchedule.xlsx) | `src/model/cableRefs.ts:standardCables` |
| Cable schedule, tray & containment | Revisions & changes | tray route / length / size changes listed in design impact | `src/model/designImpact.ts:104` |
| Network / SLD editor & core calc | Equipment, BOQ & pricing | boards, feeders, sizes, lengths, parallel runs, devices | `src/calc/bom.ts:buildBom` |
| Earthing & earth fault loop | Equipment, BOQ & pricing | earth pits, links, body bonds, CPC sizes | `src/calc/bom.ts:buildBom:181` |
| Power factor correction | Equipment, BOQ & pricing | capacitor feeders added by addPfcBanks | `src/calc/bom.ts:buildBom:228` |
| Busbar & busway | Equipment, BOQ & pricing | busway risers from sizeRiser | `src/calc/bom.ts:buildBom:322` |
| Equipment, BOQ & pricing | Reports & exports | BOQ Excel/PDF and equipment schedule in the export centre | `src/components/docs/exportCatalogue.ts:166` |
| Equipment, BOQ & pricing | Reports & exports | BOQ and BOQ summary PDFs | `src/components/docs/exportCatalogue.ts:CATALOGUE` |
| Equipment, BOQ & pricing | Revisions & changes | design impact quantities, contract BOQ, variations | `src/model/designImpact.ts:109` |
| Equipment, BOQ & pricing | Revisions & changes | BOQ design quantities in impact; BOQ revisions record designRev; variations fold into working BOQ | `src/model/variations.ts:foldVariations` |
| Equipment, BOQ & pricing | Review, submissions & authority rules | submission offer after PDF export; proposal preview quantities | `src/components/docs/BomView.tsx:exportPdf` |
| Equipment, BOQ & pricing | Review, submissions & authority rules | BOQ export offers a submission with draft-aware revision | `src/components/docs/BomView.tsx:121` |
| Equipment, BOQ & pricing | Dashboard & readiness | BOQ revision issued readiness item | `src/calc/projectReadiness.ts:77` |
| Building & load assessment | ELV systems | buildings, levels, rooms (type, area, outline, identical floors) | `src/calc/building.ts:buildingInfoOf` |
| Building & load assessment | ELV systems | data link | `src/calc/buildingDesign.ts:buildingsWithElvCircuits` |
| CAD electrical (devices on plans) | ELV systems | room outlines from CAD; edit tools on ELV devices | `src/model/deviceEdit.ts` |
| CAD electrical (devices on plans) | ELV systems | shared selection, move, copy, delete, replace for ELV devices | `src/model/deviceEdit.ts:moveDevices` |
| ELV systems | Design CAD core | device placement, Fill room, Copy to level, coverage overlay; unit rescale of devices | `src/components/cad/CadPage.tsx:elvLayer` |
| ELV systems | Data exchange & inbox | ELV loads package (one load per supply) for review and acceptance | `src/elv/package.ts:elvLoadsPackage` |
| ELV systems | Data exchange & inbox | accepted ELV loads for placement | `src/exchange/inbox.ts:acceptedElvLoads` |
| ELV systems | Data exchange & inbox | elvDevices in the design export | `src/exchange/designExport.ts:63` |
| ELV systems | Load schedule & panels | ELV supplies become linked circuits (Feeder.elvLoad) on floor DB / main / essential board | `src/calc/elvPlacement.ts:addElvCircuits` |
| Network / SLD editor & core calc | ELV systems | boards, board levels, standby/essential side, phase loading | `src/calc/elvPlacement.ts:chooseBoard` |
| ELV systems | Revisions & changes | kW changes become a proposed modification record; checkpoint before placing | `src/calc/elvPlace.ts:placeElvLoads` |
| ELV systems | Equipment, BOQ & pricing | data link | `src/calc/bom.ts:354` |
| CAD sheets, plot & title block | ELV systems | sheet frame and title block for ELV plan sheets | `src/docs/sldSheet.ts:buildSldSheetHtml` |
| ELV systems | Desktop wrapper (Electron) | PDF render of schedules and A3 plan sheets | `src/util/files.ts:renderPdf` |
| Design CAD core | Project data & storage | drawn work, erased handles, blocks, layers, styles, references kept in the project; each edit one undo step | `src/App.tsx:1621 onChange → setProject(next, { step: true })` |
| Building & load assessment | Design CAD core | levels each plan belongs to | `src/model/cadPlans.ts:withLevelPlan` |
| Design CAD core | CAD electrical (devices on plans) | outlines, blocks with attributes, wall segments, drawn trays and cable routes | `src/model/cadViewPlan.ts / src/model/cadPlanSchedules.ts` |
| Design CAD core | CAD electrical (devices on plans) | drawing geometry, layers, blocks, handles, units; drawn cable routes and tray runs in cadSketch | `src/model/cadViewPlan.ts:planOfView` |
| Design CAD core | CAD sheets, plot & title block | drawn work, block inserts and printing references on plan sheets | `src/docs/planLayout.ts:262` |
| Design CAD core | CAD sheets, plot & title block | layout and viewport commands on the CAD command line | `src/components/cad/CadPage.tsx:layoutCmd` |
| Design CAD core | CAD sheets, plot & title block | title block import and Edit in CAD use the CAD engine and drawn objects | `src/model/titleBlockCad.ts:openTitleBlockInCad` |
| Design CAD core | Drawings, SLD sheets & register | DXF to DWG conversion of exported SLD sheets | `src/engines/cad/cadEngine.ts:dxfToDwg` |
| Design CAD core | Drawings, SLD sheets & register | DXF sheets converted to DWG by the CAD engine | `src/components/docs/sheetRender.tsx:exportSheetsDwg` |
| Design CAD core | Revisions & changes | CAD fields classified in change classes and revision lists | `src/model/changeClass.ts:36` |
| Network / SLD editor & core calc | Design CAD core | feeders for CIRCUIT attributes and cable routes | `src/components/cad/CadPage.tsx:exportAs` |
| Design CAD core | Component database & library | layer mapping templates kept in the library | `src/model/cadLayerTemplates.ts:pushLibrary` |
| Network / SLD editor & core calc | CAD electrical (devices on plans) | board rename re-keys lvPoints, cadWiring, cadSketch cables and cadPlanLinks | `src/model/renamePanels.ts:renamePanels` |
| CAD electrical (devices on plans) | Voltage drop | measured route / wiring length written to Feeder.lengthM on Update schedules | `src/model/cadPlanSchedules.ts:updateSchedules` |
| CAD electrical (devices on plans) | Equipment, BOQ & pricing | luminaires placed on plans in BOQ group J | `src/calc/bom.ts:289` |
| Parameters & design rules | CAD electrical (devices on plans) | max lighting points / 13 A sockets per circuit | `src/model/deviceEdit.ts:circuitAfter` |
| CAD electrical (devices on plans) | Drawings, SLD sheets & register | lighting / power / containment plan sheets from the model | `src/docs/planLayout.ts:contentOf` |
| CAD electrical (devices on plans) | CAD sheets, plot & title block | plan layouts shown in CAD layouts and plot | `src/docs/planLayout.ts:contentOf` |
| CAD electrical (devices on plans) | CAD sheets, plot & title block | viewports draw the live plan model (devices, trays, routes, rooms) | `src/docs/planLayout.ts:viewportDrawing` |
| CAD electrical (devices on plans) | Revisions & changes | lvPoints, cadWiring, cadPlanLinks tracked as change fields | `src/model/changeClass.ts:36` |
| CAD sheets, plot & title block | Drawings, SLD sheets & register | layouts are the register's plan sheets; title block takes register number, title, rev, people | `src/components/docs/sheetRender.tsx:sheetInfo` |
| CAD sheets, plot & title block | Drawings, SLD sheets & register | title-block templates, pens, plot stamp, markups, plan sheets, Design CAD Sheets workspace | `src/components/docs/sheetRender.tsx:fullSheetInfo` |
| Drawings, SLD sheets & register | Project data & storage | Project.drawingSet saved; deleted panels removed from sheets; renamed panel ids updated in sheet.boards | `src/model/integrity.ts:removeDanglingReferences` |
| Busbar & busway | Drawings, SLD sheets & register | busbar risers and sized busway rating on riser drawings | `src/diagram/riserLayout.ts:riserLayout` |
| Drawings, SLD sheets & register | Revisions & changes | project revision, issue history, revision clouds from issued items | `src/model/drawingSet.ts:issueSheets` |
| Drawings, SLD sheets & register | Revisions & changes | sheet change list and revision clouds; register falls back to project revision | `src/model/sheetChanges.ts:sheetChanges` |
| Drawings, SLD sheets & register | Review, submissions & authority rules | each issue becomes a transmittal | `src/model/submissions.ts:submissionForIssue` |
| Drawings, SLD sheets & register | Review, submissions & authority rules | transmittal sheet for a drawing issue | `src/components/docs/DrawingsView.tsx:122` |
| Drawings, SLD sheets & register | Reports & exports | drawing set PDF parts for the issue package; drawing register in the export centre | `src/components/docs/sheetRender.tsx:drawingSetPdfParts` |
| Drawings, SLD sheets & register | Dashboard & readiness | sheet readiness checks as to-do items | `src/calc/dashboard.ts:216` |
| Drawings, SLD sheets & register | Dashboard & readiness | drawing set sheet checks; Drawings readiness stage | `src/model/drawingSet.ts:sheetChecks` |
| Drawings, SLD sheets & register | Headless CLI & MCP | sheet DXF export from the CLI through the same dxfFiles path | `src/headless/rendererExport.ts:runJob` |
| Drawings, SLD sheets & register | App shell & navigation | ribbon Publish / Rev state of the open sheet | `src/App.tsx:230` |
| Parameters & design rules | Reports & exports | study settings and design criteria with app-default flags | `src/docs/designBasis.ts:buildDesignBasis` |
| Revisions & changes | Reports & exports | current revision on cover, stamps, variation register | `src/docs/report.ts:reportHead` |
| Reports & exports | Dashboard & readiness | project summary in issue package and export centre | `src/components/docs/StudyReportsView.tsx:exportPack` |
| Revisions & changes | Project data & storage | revisions, baseline, modifications, variations saved in project file; checkpoints in .lvds-backup | `src/model/projectBackup.ts:buildBackup` |
| Load schedule & panels | Revisions & changes | circuit references, schedule circuits, board totals for sheet items | `src/model/sheetChanges.ts:sheetItems` |
| Revisions & changes | Review, submissions & authority rules | review report modification summary and impact; VO PDF offered as submission | `src/docs/reviewReport.ts` |
| Revisions & changes | Review, submissions & authority rules | baseline revision, impact and modification records for review report and proposals | `src/docs/reviewReport.ts:buildReviewDoc` |
| Revisions & changes | Review, submissions & authority rules | proposal preview in modification panel | `src/components/docs/ModificationsPanel.tsx:266` |
| Revisions & changes | Dashboard & readiness | Save and issue / No change since IFC readiness | `src/calc/projectReadiness.ts` |
| Revisions & changes | Dashboard & readiness | revision label, change since revision, modifications To do; stage issue records a revision | `src/App.tsx:issueStage` |
| Review, submissions & authority rules | Transformer & generator | growth and transformer/generator loading limits | `src/calc/txGen.ts:116` |
| UPS & solar PV | Review, submissions & authority rules | UPS sizing before/after a proposal | `src/model/proposalPreview.ts:upsChanges` |
| Review, submissions & authority rules | Reports & exports | submission register in export centre | `src/components/docs/exportCatalogue.ts:192` |
| Review, submissions & authority rules | Dashboard & readiness | review summary, tender queries, proposal to-dos, submission counts | `src/calc/projectReadiness.ts:27` |
| Review, submissions & authority rules | Dashboard & readiness | review comments block readiness; submissions card; To do feeds the review report | `src/components/docs/ReviewView.tsx:39` |
| Review, submissions & authority rules | Component database & library | user rule sets synced to Library.json | `src/model/designReference.ts:saveUserReferences` |
| Review, submissions & authority rules | Desktop wrapper (Electron) | PDF/Word saving and PDF merge for review report | `src/components/docs/ReviewView.tsx:exportAs` |
| Voltage drop | Dashboard & readiness | VD status inside CalcRun.results | `src/calc/dashboard.ts:buildDashboard` |
| Space planning & substation | Dashboard & readiness | space-plan areas as area fallback; substation areas in Concept checklist | `src/calc/dashboard.ts:buildDashboard` |
| Data exchange & inbox | Building & load assessment | buildings, levels, room types in; accepted rooms written to Building information | `src/exchange/inbox.ts:applyRooms` |
| Data exchange & inbox | Project data & storage | decision applied as one undo step; exchange log saved in project file | `src/App.tsx:onDecided` |
| Data exchange & inbox | Revisions & changes | exchange field tracked in revision comparisons | `src/model/revisions.ts:152` |
| Earthing & earth fault loop | Data exchange & inbox | Zs, max Zs, disconnection time in the design export | `src/exchange/designExport.ts:designExport` |
| Data exchange & inbox | App shell & navigation | Inbox ribbon button with waiting count | `src/components/Ribbon.tsx:545` |
| Review, submissions & authority rules | Data exchange & inbox | Received documents page opens the inbox | `src/App.tsx:1660` |
