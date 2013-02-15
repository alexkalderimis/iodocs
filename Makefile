# Makefile for iodocs
#
# Version 1.0
# Alex Kalderimis
# Fri Feb 15 13:21:32 GMT 2013

export PATH := $(shell find node_modules -name 'bin' -printf %p:)node_modules/.bin:$(PATH)

deploy:
	chernobyl deploy labs.intermine.org .

test:
	@echo No Tests!

.PHONY: test
