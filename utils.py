import urllib.request
import os
from pathlib import Path

def download_file(download_url):
    response = urllib.request.urlopen(download_url)
    filename = 'pdf/' + Path(download_url).name
    file = open(filename, 'wb')
    file.write(response.read())
    file.close()
    return filename

def remove_file(local_path):
    os.remove(local_path)
