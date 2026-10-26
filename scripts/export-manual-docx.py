#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/export-manual-docx.py
Converts docs/OPERATOR_MANUAL.md into a beautifully formatted Microsoft Word (.docx) document
with custom typography, embedded high-res screenshots, styled tables, and industrial callout boxes.
"""

import os
import re
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn, nsdecls

MD_PATH = os.path.join("docs", "OPERATOR_MANUAL.md")
DOCX_OUT_PATH = os.path.join("docs", "JsonMeta现场运维实操手册.docx")
ROOT_DOCX_PATH = "JsonMeta现场运维实操手册.docx"
IMAGES_DIR = os.path.join("docs", "images")

def set_run_font(run, font_name="微软雅黑", size_pt=10.5, color=RGBColor(30, 41, 59), bold=False, italic=False):
    run.font.name = font_name
    run.font.size = Pt(size_pt)
    run.font.color.rgb = color
    run.font.bold = bold
    run.font.italic = italic
    rPr = run._r.get_or_add_rPr()
    rFonts = rPr.get_or_add_rFonts()
    rFonts.set(qn("w:eastAsia"), font_name)

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    tcPr.append(parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>'))

def set_cell_margins(cell, top=120, bottom=120, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(f'<w:tcMar {nsdecls("w")}><w:top w:w="{top}" w:type="dxa"/><w:bottom w:w="{bottom}" w:type="dxa"/><w:left w:w="{left}" w:type="dxa"/><w:right w:w="{right}" w:type="dxa"/></w:tcMar>')
    tcPr.append(tcMar)

def clean_inline_formatting(text):
    # Replace <kbd>Key</kbd> with [Key]
    text = re.sub(r'<kbd>(.*?)</kbd>', r'[\1]', text)
    # Replace `code` with code
    # We will handle strong / bold runs during paragraph construction if needed
    return text

def parse_markdown_and_build_docx(md_path, docx_path):
    with open(md_path, "r", encoding="utf-8") as f:
        lines = [line.rstrip("\r\n") for line in f]

    doc = Document()

    # Set page margins (A4: 2.54 cm all around)
    for section in doc.sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)
        section.different_first_page_header_footer = True
        
        # Header for normal pages
        header = section.header
        hp = header.paragraphs[0]
        hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        hrun = hp.add_run("JsonMeta 工业级配置管理工具 · 现场运维实操手册")
        set_run_font(hrun, "微软雅黑", 8.5, RGBColor(148, 163, 184))

        # Footer
        footer = section.footer
        fp = footer.paragraphs[0]
        fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        frun = fp.add_run("第 ")
        set_run_font(frun, "微软雅黑", 8.5, RGBColor(148, 163, 184))
        # Add PAGE field
        fld_page = parse_xml(r'<w:fldSimple %s w:instr="PAGE"/>' % nsdecls('w'))
        fp._p.append(fld_page)
        frun2 = fp.add_run(" 页")
        set_run_font(frun2, "微软雅黑", 8.5, RGBColor(148, 163, 184))

    # Base styles
    normal_style = doc.styles['Normal']
    normal_style.font.name = 'Calibri'
    normal_style._element.rPr.rFonts.set(qn('w:eastAsia'), '微软雅黑')
    normal_style.font.size = Pt(10.5)

    i = 0
    in_table = False
    table_lines = []
    fig_counter = 1

    def flush_table():
        nonlocal in_table, table_lines
        if not table_lines:
            return
        
        # Parse table markdown
        rows_data = []
        for tl in table_lines:
            # skip separator line |:---|:---|
            if re.match(r'^\s*\|?\s*:?-+:?\s*\|', tl):
                continue
            cells = [c.strip() for c in tl.split('|')]
            if len(cells) >= 2 and cells[0] == '' and cells[-1] == '':
                cells = cells[1:-1]
            rows_data.append(cells)
        
        table_lines = []
        in_table = False
        if not rows_data:
            return

        num_cols = max(len(r) for r in rows_data)
        table = doc.add_table(rows=len(rows_data), cols=num_cols)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER

        # Table XML borders
        tblPr = table._tbl.tblPr
        tblBorders = parse_xml(
            f'<w:tblBorders {nsdecls("w")}>'
            f'<w:top w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>'
            f'<w:left w:val="none"/>'
            f'<w:bottom w:val="single" w:sz="8" w:space="0" w:color="94A3B8"/>'
            f'<w:right w:val="none"/>'
            f'<w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>'
            f'<w:insideV w:val="none"/>'
            f'</w:tblBorders>'
        )
        tblPr.append(tblBorders)

        for row_idx, r_data in enumerate(rows_data):
            row = table.rows[row_idx]
            is_header = (row_idx == 0)
            for col_idx in range(num_cols):
                cell = row.cells[col_idx]
                text = r_data[col_idx] if col_idx < len(r_data) else ""
                text = clean_inline_formatting(text)
                
                # set background
                if is_header:
                    set_cell_background(cell, "1E3A8A")
                    set_cell_margins(cell, top=140, bottom=140, left=140, right=140)
                else:
                    bg_color = "F8FAFC" if row_idx % 2 == 1 else "FFFFFF"
                    set_cell_background(cell, bg_color)
                    set_cell_margins(cell, top=100, bottom=100, left=140, right=140)

                cp = cell.paragraphs[0]
                cp.alignment = WD_ALIGN_PARAGRAPH.CENTER if (is_header or col_idx == 0) else WD_ALIGN_PARAGRAPH.LEFT
                cp.paragraph_format.space_before = Pt(2)
                cp.paragraph_format.space_after = Pt(2)

                crun = cp.add_run(text)
                if is_header:
                    set_run_font(crun, "微软雅黑", 10, RGBColor(255, 255, 255), bold=True)
                else:
                    if col_idx == 0:
                        set_run_font(crun, "Consolas", 9.5, RGBColor(15, 23, 42), bold=True)
                    else:
                        set_run_font(crun, "微软雅黑", 9.5, RGBColor(51, 65, 85))

        # Add a trailing space after table
        after_p = doc.add_paragraph()
        after_p.paragraph_format.space_before = Pt(4)
        after_p.paragraph_format.space_after = Pt(6)

    while i < len(lines):
        line = lines[i]

        # Check table
        if line.strip().startswith('|') and '|' in line.strip()[1:]:
            in_table = True
            table_lines.append(line)
            i += 1
            continue
        elif in_table:
            flush_table()

        # Blank line
        if not line.strip():
            i += 1
            continue

        # Horizontal rule
        if re.match(r'^\s*---\s*$', line):
            i += 1
            continue

        # Title: # ...
        if line.startswith('# '):
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(12)
            p.paragraph_format.space_after = Pt(4)
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run(line[2:].strip())
            set_run_font(run, "微软雅黑", 22, RGBColor(15, 23, 42), bold=True)
            i += 1
            continue

        # Subtitle: ## ... at the top
        if line.startswith('## 现场运维与工程调试实操手册'):
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(16)
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run("现场运维与工程调试实操手册")
            set_run_font(run, "微软雅黑", 14, RGBColor(37, 99, 235), bold=True)
            i += 1
            continue

        # Metadata block: > **工具版本** ...
        if line.startswith('> '):
            quote_lines = []
            while i < len(lines) and lines[i].startswith('> '):
                quote_lines.append(lines[i][2:].strip())
                i += 1
            
            # Render as styled callout box / metadata box
            callout_tbl = doc.add_table(rows=1, cols=1)
            callout_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
            cell = callout_tbl.cell(0, 0)
            set_cell_background(cell, "F1F5F9")
            set_cell_margins(cell, top=140, bottom=140, left=180, right=180)
            
            # Left border only (blue)
            tcPr = cell._tc.get_or_add_tcPr()
            tcBorders = parse_xml(
                f'<w:tcBorders {nsdecls("w")}>'
                f'<w:top w:val="none"/>'
                f'<w:left w:val="single" w:sz="24" w:space="0" w:color="0284C7"/>'
                f'<w:bottom w:val="none"/>'
                f'<w:right w:val="none"/>'
                f'</w:tcBorders>'
            )
            tcPr.append(tcBorders)

            cp = cell.paragraphs[0]
            cp.paragraph_format.space_before = Pt(2)
            cp.paragraph_format.space_after = Pt(2)
            cp.paragraph_format.line_spacing = 1.35
            
            full_quote_text = "\n".join(quote_lines)
            parts = re.split(r'(\*\*.*?\*\*)', full_quote_text)
            for part in parts:
                if part.startswith('**') and part.endswith('**'):
                    r = cp.add_run(part[2:-2])
                    set_run_font(r, "微软雅黑", 9.5, RGBColor(30, 41, 59), bold=True)
                else:
                    clean_txt = clean_inline_formatting(part)
                    r = cp.add_run(clean_txt)
                    set_run_font(r, "微软雅黑", 9.5, RGBColor(71, 85, 105))
            
            # Space after blockquote
            sp = doc.add_paragraph()
            sp.paragraph_format.space_before = Pt(0)
            sp.paragraph_format.space_after = Pt(8)
            continue

        # Heading 1: ## ...
        if line.startswith('## '):
            h_text = line[3:].strip()
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(18)
            p.paragraph_format.space_after = Pt(6)
            p.paragraph_format.keep_with_next = True
            
            run = p.add_run(h_text)
            set_run_font(run, "微软雅黑", 14.5, RGBColor(30, 58, 138), bold=True)
            i += 1
            continue

        # Heading 2: ### ...
        if line.startswith('### '):
            h_text = line[4:].strip()
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(12)
            p.paragraph_format.space_after = Pt(4)
            p.paragraph_format.keep_with_next = True
            
            run = p.add_run(h_text)
            set_run_font(run, "微软雅黑", 12, RGBColor(2, 132, 199), bold=True)
            i += 1
            continue

        # Image: ![caption](images/01-empty-state.png)
        img_match = re.match(r'!\[(.*?)\]\((.*?)\)', line.strip())
        if img_match:
            caption = img_match.group(1)
            img_rel = img_match.group(2)
            img_path = os.path.normpath(os.path.join("docs", img_rel))
            
            if os.path.exists(img_path):
                # Add picture
                p_img = doc.add_paragraph()
                p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p_img.paragraph_format.space_before = Pt(8)
                p_img.paragraph_format.space_after = Pt(3)
                p_img.paragraph_format.keep_with_next = True
                
                # Max width: 6.0 inches
                p_img.add_run().add_picture(img_path, width=Inches(6.0))
                
                # Caption
                p_cap = doc.add_paragraph()
                p_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p_cap.paragraph_format.space_before = Pt(2)
                p_cap.paragraph_format.space_after = Pt(12)
                cap_run = p_cap.add_run(f"图 {fig_counter}：{caption}")
                set_run_font(cap_run, "微软雅黑", 9, RGBColor(100, 116, 139), italic=True)
                fig_counter += 1
            else:
                p_err = doc.add_paragraph()
                r_err = p_err.add_run(f"[图片缺失: {img_path}]")
                set_run_font(r_err, "微软雅黑", 9.5, RGBColor(220, 38, 38))
            
            i += 1
            continue

        # Ordered list / TOC link: 1. [Title](#anchor) or 1. **Title**
        num_match = re.match(r'^\s*(\d+)\.\s+(.*)', line)
        if num_match:
            num = num_match.group(1)
            content = num_match.group(2).strip()
            
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.25)
            p.paragraph_format.space_before = Pt(1.5)
            p.paragraph_format.space_after = Pt(1.5)
            p.paragraph_format.line_spacing = 1.25

            # Number
            n_run = p.add_run(f"{num}. ")
            set_run_font(n_run, "Calibri", 10, RGBColor(37, 99, 235), bold=True)

            # Check if TOC markdown link: [Text](#anchor)
            link_match = re.match(r'\[(.*?)\]\(#.*?\)', content)
            if link_match:
                c_text = link_match.group(1)
                c_run = p.add_run(c_text)
                set_run_font(c_run, "微软雅黑", 10, RGBColor(30, 41, 59))
            else:
                # Normal list item with bold or formatting
                parse_mixed_paragraph(p, clean_inline_formatting(content))
            
            i += 1
            continue

        # Bullet list: - ... or * ... or sub-bullet
        bullet_match = re.match(r'^(\s*)[-*]\s+(.*)', line)
        if bullet_match:
            indent_spaces = len(bullet_match.group(1))
            content = bullet_match.group(2).strip()

            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.25 + (0.25 if indent_spaces > 0 else 0))
            p.paragraph_format.space_before = Pt(1.5)
            p.paragraph_format.space_after = Pt(1.5)
            p.paragraph_format.line_spacing = 1.25

            b_run = p.add_run("•  " if indent_spaces == 0 else "⁃  ")
            set_run_font(b_run, "Arial", 9.5, RGBColor(2, 132, 199), bold=True)

            link_match = re.match(r'\[(.*?)\]\(#.*?\)', content)
            if link_match:
                c_text = link_match.group(1)
                c_run = p.add_run(c_text)
                set_run_font(c_run, "微软雅黑", 9.5, RGBColor(71, 85, 105))
            else:
                parse_mixed_paragraph(p, clean_inline_formatting(content))

            i += 1
            continue

        # Normal paragraph
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(2)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.line_spacing = 1.3
        parse_mixed_paragraph(p, clean_inline_formatting(line))
        i += 1

    # End of document, check if flush_table needed
    if in_table:
        flush_table()

    # Save to both paths
    doc.save(docx_path)
    if os.path.exists(docx_path):
        import shutil
        shutil.copy2(docx_path, ROOT_DOCX_PATH)
        print(f"SUCCESS: Saved {docx_path} and {ROOT_DOCX_PATH}")

def parse_mixed_paragraph(p, text):
    # Splits by bold `**...**` and code `` `...` ``
    tokens = re.split(r'(\*\*.*?\*\*|`.*?`)', text)
    for tok in tokens:
        if not tok:
            continue
        if tok.startswith('**') and tok.endswith('**'):
            inner = tok[2:-2]
            r = p.add_run(inner)
            set_run_font(r, "微软雅黑", 10, RGBColor(15, 23, 42), bold=True)
        elif tok.startswith('`') and tok.endswith('`'):
            inner = tok[1:-1]
            r = p.add_run(inner)
            set_run_font(r, "Consolas", 9.5, RGBColor(2, 132, 199), bold=True)
        else:
            r = p.add_run(tok)
            set_run_font(r, "微软雅黑", 10, RGBColor(51, 65, 85))

if __name__ == "__main__":
    parse_markdown_and_build_docx(MD_PATH, DOCX_OUT_PATH)
