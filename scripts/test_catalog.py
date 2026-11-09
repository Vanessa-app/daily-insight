import datetime as dt
import importlib.util
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('catalog','scripts/update_catalog.py')
catalog=importlib.util.module_from_spec(spec);spec.loader.exec_module(catalog)

class CatalogContracts(unittest.TestCase):
    def test_media_is_attributed_and_not_claimed_as_fulltext(self):
        source={'id':'test','name':'Test media','category':'科技','feed':'https://example.com/rss','allowed_hosts':['example.com']}
        now=catalog.NOW.strftime('%a, %d %b %Y %H:%M:%S GMT')
        xml=f'<rss><channel><item><title>科學新聞</title><link>https://example.com/a?tracking=1</link><pubDate>{now}</pubDate><description>Not licensed for reprinting</description></item></channel></rss>'.encode()
        with patch.object(catalog,'fetch',return_value=xml):items=catalog.media_feed(source)
        self.assertEqual(len(items),1)
        self.assertEqual(items[0]['url'],'https://example.com/a')
        self.assertFalse(items[0]['content_complete'])
        self.assertEqual(items[0]['evidence_original'],[])
        self.assertEqual(items[0]['content_scope'],'media_headline')

    def test_xml_invalid_control_characters_do_not_discard_an_entire_feed(self):
        source={'id':'test','name':'Test','category':'生活','feed':'https://example.com/rss','allowed_hosts':['example.com'],'rss_reuse':True}
        now=catalog.NOW.strftime('%a, %d %b %Y %H:%M:%S GMT')
        xml=f'<rss><channel><item><title>新聞</title><link>https://example.com/a</link><pubDate>{now}</pubDate><description><![CDATA[保留文字\x08以及後續內容]]></description></item></channel></rss>'.encode()
        with patch.object(catalog,'fetch',return_value=xml):items=catalog.media_feed(source)
        self.assertEqual(items[0]['evidence_original'],['保留文字以及後續內容'])

    def test_rejects_off_domain_and_future_entries(self):
        source={'id':'test','name':'Test','category':'科技','feed':'https://example.com/rss','allowed_hosts':['example.com']}
        now=catalog.NOW.strftime('%a, %d %b %Y %H:%M:%S GMT')
        future=(catalog.NOW+dt.timedelta(days=2)).strftime('%a, %d %b %Y %H:%M:%S GMT')
        xml=f'<rss><channel><item><title>Offsite</title><link>https://evil.example/a</link><pubDate>{now}</pubDate></item><item><title>Future</title><link>https://example.com/a</link><pubDate>{future}</pubDate></item></channel></rss>'.encode()
        with patch.object(catalog,'fetch',return_value=xml):self.assertEqual(catalog.media_feed(source),[])

    def test_short_or_formula_dependent_knowledge_does_not_enter_library(self):
        page={'query':{'pages':{'1':{'pageid':1,'ns':0,'title':'Test','extract':'This is too short.'}}}}
        with patch.object(catalog,'wiki_query',return_value=page):
            with self.assertRaises(ValueError):catalog.knowledge_article('Test','科技',[])
        page['query']['pages']['1']['extract']='\\displaystyle '+('有意義但依賴未呈現公式的文章。'*100)
        with patch.object(catalog,'wiki_query',return_value=page):
            with self.assertRaises(ValueError):catalog.knowledge_article('Test','科技',[])

    def test_missing_pages_are_not_mislabelled_as_articles(self):
        with patch.object(catalog,'wiki_query',return_value={'query':{'pages':{'-1':{'missing':'','ns':0}}}}):
            with self.assertRaises(ValueError):catalog.knowledge_article('missing','科技',[])

if __name__=='__main__':unittest.main()
