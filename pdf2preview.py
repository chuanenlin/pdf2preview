import streamlit as st
from PIL import Image, ImageFilter, ImageOps
import sys
import io
from utils import download_file, remove_file
import fitz #pip install PyMuPDF

def add_border(image, border):
    img_with_border = ImageOps.expand(image, border=border, fill="black")
    return img_with_border

def add_shadow(image, offset, shadow, border):
    total_width = image.size[0] + abs(offset[0]) + 2 * border
    total_height = image.size[1] + abs(offset[1]) + 2 * border
    back = Image.new("RGBA", (total_width, total_height), (0, 0, 0, 0))
    shadow = Image.new("RGBA", (image.size[0], image.size[1]), (0, 0, 0, 255))
    shadow_left = border + max(offset[0], 0)
    shadow_top = border + max(offset[1], 0)
    back.alpha_composite(shadow, (shadow_left, shadow_top))
    back = back.filter(ImageFilter.GaussianBlur(10))
    back.convert("RGBA") 
    img_left = border - min(offset[0], 0)
    img_top = border - min(offset[1], 0)
    back.paste(image, (img_left, img_top), image.convert("RGBA"))
    back.convert("RGBA")
    return back

def stack(images, mode):
    num_images = len(images)
    widths, heights = zip(*(i.size for i in images))
    if mode == "Unroll":
        separation = 700
        total_width = sum(widths) - separation * (num_images - 1)
        max_height = max(heights)
        new_im = Image.new("RGBA", (total_width, max_height))
        x_offset = total_width - images[0].size[0]
        for im in images:
            new_im.alpha_composite(im, (x_offset, 0))
            x_offset -= im.size[0] - separation
    elif mode == "Stack":
        separation = 10
        total_width = widths[0] + separation * (num_images - 1)
        total_height = heights[0] + separation * (num_images - 1)
        new_im = Image.new("RGBA", (total_width, total_height))
        x_offset = total_width - images[0].size[0]
        y_offset = 0
        for im in images:
            new_im.alpha_composite(im, (x_offset, y_offset))
            x_offset -= separation
            y_offset += separation
    elif mode == "Cover":
        new_im = images[-1]
    return new_im

st.set_page_config(page_title="pdf2preview", page_icon="📄", layout="centered", initial_sidebar_state="collapsed", menu_items=None)
hide_streamlit_style = """
	<style>
	MainMenu {visibility: hidden;}
	footer {visibility: hidden;}
	* {font-family: Avenir;}
    h1 {text-align: center;}
	.css-gma2qf {display: flex; justify-content: center; font-size: 36px; font-weight: bold;}
	a:link {text-decoration: none;}
	a:hover {text-decoration: none;}
	.st-ba {font-family: Avenir;}
    .st-button {text-align: center;}
	</style>
	"""
st.markdown(hide_streamlit_style, unsafe_allow_html=True)
st.title("PDF ➡️ Preview")
st.markdown("Generate a preview image for your PDF file.")

col1, col2 = st.columns([1, 5])
with col1:
    st.radio("Pick a layout", ("Unroll", "Stack", "Cover"), key="mode")
with col2:
    st.image("example.png")
st.file_uploader("Upload your PDF", type="pdf", key="file")
st.write("or")
url = st.text_input("Submit link to PDF")


if st.button('Generate preview'):
    with st.spinner("Processing..."):
        if st.session_state.file is not None:
            file = fitz.open("pdf", st.session_state.file.read())
        else:
            try:
                filename = download_file(url)
                file = fitz.open(filename)
            except:
                e = ValueError('Could not download pdf file from URL')
                st.error('Please enter a valid pdf URL', icon="🚨")
                raise e

        zoom = 2
        mat = fitz.Matrix(zoom, zoom)
        num_pages = file.page_count
        imgs = []
        for page_num in range(num_pages):
            page = file.load_page(page_num)
            pix = page.get_pixmap(matrix = mat)
            data = pix.tobytes("png")
            img = Image.open(io.BytesIO(data))
            img_with_border = add_border(img, border=1)
            img_with_shadow = add_shadow(img_with_border, offset=(0,0), shadow=(0,0,0,255), border=20)
            imgs.append(img_with_shadow)
        preview = stack(imgs[::-1], st.session_state.mode)
        st.image(preview)
        output = io.BytesIO()
        preview.save(output, format="PNG")
        output = output.getvalue()
        b1, b2, b3 = st.columns([1, 1, 1])
        with b2:
            download = st.download_button(label="Download image", data=output, file_name="pdf2preview.png", mime="image/png")
        if st.session_state.file is None:
            remove_file(filename)
st.markdown("By [David Chuan-En Lin](https://chuanenlin.com). PDF URL support by [Eliott Zemour](https://github.com/EliottZemour). Play with the code at https://github.com/chuanenlin/pdf2preview.")
