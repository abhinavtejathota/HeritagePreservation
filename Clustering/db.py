import psycopg2
import os

conn = psycopg2.connect(
    host="localhost",
    database="sites_db",
    user="postgres",
    password="Yoimiya3000!",
    port=5432
)

def get_cursor():
    return conn.cursor()
